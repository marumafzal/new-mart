1. DATABASE MIGRATION FILE
File: artifacts/api-server/src/migrations/add-otp-bypass-system.ts
TypeScript
import { sql } from "drizzle-orm";
import type { Database } from "../db";

export async function up(db: Database) {
  // 1. Add columns to users table if not exist
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_bypass_until TIMESTAMP NULL DEFAULT NULL`
  );

  // 2. Create whitelist_users table
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS whitelist_users (
      id VARCHAR(36) PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL UNIQUE,
      label VARCHAR(255),
      bypass_code VARCHAR(6) NOT NULL DEFAULT '000000',
      is_active BOOLEAN DEFAULT true,
      expires_at TIMESTAMP NULL,
      created_by VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_identifier (identifier),
      INDEX idx_expires_at (expires_at),
      INDEX idx_is_active (is_active)
    )`
  );

  // 3. Create otp_bypass_audit table
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS otp_bypass_audit (
      id VARCHAR(36) PRIMARY KEY,
      event_type VARCHAR(50) NOT NULL,
      user_id VARCHAR(36),
      admin_id VARCHAR(36),
      phone VARCHAR(20),
      email VARCHAR(255),
      bypass_reason VARCHAR(50),
      expires_at TIMESTAMP NULL,
      ip_address VARCHAR(45),
      user_agent VARCHAR(500),
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event_type (event_type),
      INDEX idx_user_id (user_id),
      INDEX idx_created_at (created_at),
      INDEX idx_admin_id (admin_id)
    )`
  );

  // 4. Add indexes to users table
  await db.execute(
    sql`ALTER TABLE users ADD INDEX IF NOT EXISTS idx_otp_bypass_until (otp_bypass_until)`
  );

  // 5. Add constraint check
  await db.execute(
    sql`ALTER TABLE whitelist_users ADD CONSTRAINT chk_bypass_code CHECK (bypass_code REGEXP '^[0-9]{6}$')`
  );

  console.log("✅ OTP Bypass system migration completed");
}

export async function down(db: Database) {
  // Rollback
  await db.execute(sql`DROP TABLE IF EXISTS otp_bypass_audit`);
  await db.execute(sql`DROP TABLE IF EXISTS whitelist_users`);
  await db.execute(
    sql`ALTER TABLE users DROP COLUMN IF EXISTS otp_bypass_until`
  );
  console.log("✅ OTP Bypass system rollback completed");
}
🔌 2. BACKEND API ROUTES
File: artifacts/api-server/src/routes/admin/otp-control.ts
TypeScript
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import { eq, and, gt, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { generateId } from "../../lib/id.js";
import {
  getClientIp,
  addAuditEntry,
  addSecurityEvent,
} from "../../middleware/security.js";
import { getCachedSettings } from "../../middleware/security.js";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

// Custom tables (need to import from db schema)
// For now, using raw SQL for brevity

// Rate limiter for OTP control
const otpControlLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});

// Validation schemas
const disableOTPSchema = z.object({
  minutes: z.number().int().positive().max(1440).optional(),
});

const grantBypassSchema = z.object({
  minutes: z.number().int().positive().max(1440),
});

const whitelistSchema = z.object({
  identifier: z.string().min(7).max(255),
  label: z.string().max(255).optional(),
  bypassCode: z.string().regex(/^\d{6}$/).optional(),
  expiresAt: z.string().datetime().optional(),
});

// ============================================
// GET /api/admin/otp/status
// ============================================
router.get("/status", otpControlLimiter, async (req, res) => {
  try {
    const settings = await getCachedSettings();

    // Check global disable
    const globalDisabledUntil = settings["otp_global_disabled_until"];
    const now = new Date();
    let isGloballyDisabled = false;
    let disabledUntil = null;
    let remainingSeconds = 0;

    if (globalDisabledUntil) {
      const disabledDate = new Date(globalDisabledUntil);
      if (disabledDate > now) {
        isGloballyDisabled = true;
        disabledUntil = globalDisabledUntil;
        remainingSeconds = Math.ceil(
          (disabledDate.getTime() - now.getTime()) / 1000
        );
      }
    }

    // Count active bypasses
    const [activeBypassResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM users WHERE otp_bypass_until > NOW()`
    );
    const activeBypassCount = (activeBypassResult as any)[0]?.count || 0;

    // Count whitelist entries
    const [whitelistResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM whitelist_users WHERE is_active = true 
        AND (expires_at IS NULL OR expires_at > NOW())`
    );
    const whitelistCount = (whitelistResult as any)[0]?.count || 0;

    addAuditEntry({
      action: "otp_status_checked",
      ip: getClientIp(req),
      details: `OTP status checked - globally disabled: ${isGloballyDisabled}`,
      result: "success",
    });

    res.json({
      isGloballyDisabled,
      disabledUntil,
      remainingSeconds,
      activeBypassCount,
      whitelistCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Status check failed");
    addSecurityEvent({
      type: "otp_status_error",
      ip: getClientIp(req),
      details: "Failed to check OTP status",
      severity: "medium",
    });
    res.status(500).json({ error: "Failed to check OTP status" });
  }
});

// ============================================
// POST /api/admin/otp/disable
// ============================================
router.post("/disable", otpControlLimiter, async (req, res) => {
  try {
    const { minutes } = disableOTPSchema.parse(req.body);

    const disabledUntilDate = minutes
      ? new Date(Date.now() + minutes * 60 * 1000)
      : null;

    // Update platform settings
    const updateQuery = disabledUntilDate
      ? `UPDATE platform_settings SET value = ? WHERE key = 'otp_global_disabled_until'`
      : `UPDATE platform_settings SET value = NULL WHERE key = 'otp_global_disabled_until'`;

    await db.execute(
      sql`INSERT INTO platform_settings (key, value) VALUES ('otp_global_disabled_until', ${disabledUntilDate?.toISOString() || null})
          ON DUPLICATE KEY UPDATE value = VALUES(value)`
    );

    // Log audit entry
    addAuditEntry({
      action: "otp_global_disabled",
      ip: getClientIp(req),
      details: `Global OTP suspended${minutes ? ` for ${minutes} minutes` : " indefinitely"}`,
      result: "success",
    });

    // Log to auth audit
    await db.execute(
      sql`INSERT INTO otp_bypass_audit (id, event_type, bypass_reason, expires_at, ip_address, metadata, created_at)
          VALUES (${generateId()}, 'otp_global_disable', 'admin_action', ${disabledUntilDate}, ${getClientIp(req)}, 
          JSON_OBJECT('minutes', ${minutes || null}), NOW())`
    );

    res.json({
      success: true,
      disabledUntil: disabledUntilDate?.toISOString() || null,
      message: `OTP suspended${minutes ? ` for ${minutes} minutes` : " indefinitely"}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    logger.error({ error }, "[OTP] Disable failed");
    res.status(500).json({ error: "Failed to disable OTP" });
  }
});

// ============================================
// DELETE /api/admin/otp/disable
// ============================================
router.delete("/disable", otpControlLimiter, async (req, res) => {
  try {
    // Clear global disable
    await db.execute(
      sql`DELETE FROM platform_settings WHERE key = 'otp_global_disabled_until'`
    );

    addAuditEntry({
      action: "otp_global_restored",
      ip: getClientIp(req),
      details: "Global OTP suspension restored",
      result: "success",
    });

    await db.execute(
      sql`INSERT INTO otp_bypass_audit (id, event_type, bypass_reason, ip_address, metadata, created_at)
          VALUES (${generateId()}, 'otp_global_restore', 'admin_action', ${getClientIp(req)}, 
          JSON_OBJECT('action', 'restore'), NOW())`
    );

    res.json({
      success: true,
      message: "OTP verification restored",
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Restore failed");
    res.status(500).json({ error: "Failed to restore OTP" });
  }
});

// ============================================
// POST /api/admin/users/:userId/otp/bypass
// ============================================
router.post("/users/:userId/bypass", otpControlLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { minutes } = grantBypassSchema.parse(req.body);

    // Verify user exists
    const [user] = await db.execute(
      sql`SELECT id, phone, email, name FROM users WHERE id = ${userId} LIMIT 1`
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const bypassUntil = new Date(Date.now() + minutes * 60 * 1000);

    // Update user
    await db.execute(
      sql`UPDATE users SET otp_bypass_until = ${bypassUntil}, updated_at = NOW() WHERE id = ${userId}`
    );

    addAuditEntry({
      action: "otp_bypass_granted",
      ip: getClientIp(req),
      details: `OTP bypass granted to user ${user.phone} for ${minutes} minutes`,
      result: "success",
    });

    // Log to audit
    await db.execute(
      sql`INSERT INTO otp_bypass_audit (id, event_type, user_id, admin_id, phone, bypass_reason, expires_at, ip_address, metadata, created_at)
          VALUES (${generateId()}, 'otp_bypass_granted', ${userId}, 'admin-placeholder', ${user.phone}, 
          'admin_grant', ${bypassUntil}, ${getClientIp(req)}, JSON_OBJECT('minutes', ${minutes}), NOW())`
    );

    res.json({
      success: true,
      bypassUntil: bypassUntil.toISOString(),
      minutesGranted: minutes,
      userPhone: user.phone,
      userName: user.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    logger.error({ error }, "[OTP] Grant bypass failed");
    res.status(500).json({ error: "Failed to grant bypass" });
  }
});

// ============================================
// DELETE /api/admin/users/:userId/otp/bypass
// ============================================
router.delete("/users/:userId/bypass", otpControlLimiter, async (req, res) => {
  try {
    const { userId } = req.params;

    const [user] = await db.execute(
      sql`SELECT id, phone, name FROM users WHERE id = ${userId} LIMIT 1`
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Clear bypass
    await db.execute(
      sql`UPDATE users SET otp_bypass_until = NULL, updated_at = NOW() WHERE id = ${userId}`
    );

    addAuditEntry({
      action: "otp_bypass_revoked",
      ip: getClientIp(req),
      details: `OTP bypass revoked for user ${user.phone}`,
      result: "success",
    });

    // Log to audit
    await db.execute(
      sql`INSERT INTO otp_bypass_audit (id, event_type, user_id, phone, bypass_reason, ip_address, created_at)
          VALUES (${generateId()}, 'otp_bypass_revoked', ${userId}, ${user.phone}, 'admin_revoke', 
          ${getClientIp(req)}, NOW())`
    );

    res.json({
      success: true,
      message: `Bypass revoked for ${user.phone}`,
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Revoke bypass failed");
    res.status(500).json({ error: "Failed to revoke bypass" });
  }
});

// ============================================
// GET /api/admin/otp/audit
// ============================================
router.get("/audit", otpControlLimiter, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const [auditEntries] = await db.execute(
      sql`SELECT * FROM otp_bypass_audit ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    );

    const [totalResult] = await db.execute(
      sql`SELECT COUNT(*) as total FROM otp_bypass_audit`
    );

    const total = (totalResult as any)[0]?.total || 0;

    res.json({
      total,
      limit,
      offset,
      entries: auditEntries || [],
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Audit query failed");
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ============================================
// GET /api/admin/whitelist
// ============================================
router.get("/whitelist", async (req, res) => {
  try {
    const [entries] = await db.execute(
      sql`SELECT id, identifier, label, bypass_code, is_active, expires_at, created_at, updated_at 
          FROM whitelist_users ORDER BY created_at DESC`
    );

    res.json({
      entries: entries || [],
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Whitelist fetch failed");
    res.status(500).json({ error: "Failed to fetch whitelist" });
  }
});

// ============================================
// POST /api/admin/whitelist
// ============================================
router.post("/whitelist", otpControlLimiter, async (req, res) => {
  try {
    const {
      identifier,
      label,
      bypassCode = "000000",
      expiresAt,
    } = whitelistSchema.parse(req.body);

    // Check if already exists
    const [existing] = await db.execute(
      sql`SELECT id FROM whitelist_users WHERE identifier = ${identifier} LIMIT 1`
    );

    if (existing) {
      return res.status(409).json({ error: "Identifier already whitelisted" });
    }

    const id = generateId();

    await db.execute(
      sql`INSERT INTO whitelist_users (id, identifier, label, bypass_code, is_active, expires_at)
          VALUES (${id}, ${identifier}, ${label || null}, ${bypassCode}, true, ${expiresAt || null})`
    );

    addAuditEntry({
      action: "whitelist_entry_added",
      ip: getClientIp(req),
      details: `Whitelist entry added: ${identifier}`,
      result: "success",
    });

    res.json({
      entry: {
        id,
        identifier,
        label: label || null,
        bypassCode,
        isActive: true,
        expiresAt: expiresAt || null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    logger.error({ error }, "[OTP] Whitelist add failed");
    res.status(500).json({ error: "Failed to add whitelist entry" });
  }
});

// ============================================
// PATCH /api/admin/whitelist/:id
// ============================================
router.patch("/whitelist/:id", otpControlLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verify exists
    const [existing] = await db.execute(
      sql`SELECT * FROM whitelist_users WHERE id = ${id} LIMIT 1`
    );

    if (!existing) {
      return res.status(404).json({ error: "Whitelist entry not found" });
    }

    const updateClauses = [];
    const params = [];

    if (updates.label !== undefined) {
      updateClauses.push("label = ?");
      params.push(updates.label);
    }
    if (updates.bypassCode) {
      if (!/^\d{6}$/.test(updates.bypassCode)) {
        return res.status(400).json({ error: "Invalid bypass code" });
      }
      updateClauses.push("bypass_code = ?");
      params.push(updates.bypassCode);
    }
    if (updates.isActive !== undefined) {
      updateClauses.push("is_active = ?");
      params.push(updates.isActive);
    }
    if (updates.expiresAt !== undefined) {
      updateClauses.push("expires_at = ?");
      params.push(updates.expiresAt);
    }

    if (updateClauses.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updateClauses.push("updated_at = NOW()");

    await db.execute(
      sql`UPDATE whitelist_users SET ${sql.raw(updateClauses.join(", "))} WHERE id = ${id}`
    );

    addAuditEntry({
      action: "whitelist_entry_updated",
      ip: getClientIp(req),
      details: `Whitelist entry updated: ${existing.identifier}`,
      result: "success",
    });

    res.json({
      success: true,
      message: "Whitelist entry updated",
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Whitelist update failed");
    res.status(500).json({ error: "Failed to update whitelist entry" });
  }
});

// ============================================
// DELETE /api/admin/whitelist/:id
// ============================================
router.delete("/whitelist/:id", otpControlLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await db.execute(
      sql`SELECT identifier FROM whitelist_users WHERE id = ${id} LIMIT 1`
    );

    if (!existing) {
      return res.status(404).json({ error: "Whitelist entry not found" });
    }

    await db.execute(sql`DELETE FROM whitelist_users WHERE id = ${id}`);

    addAuditEntry({
      action: "whitelist_entry_deleted",
      ip: getClientIp(req),
      details: `Whitelist entry deleted: ${existing.identifier}`,
      result: "success",
    });

    res.json({
      success: true,
      message: "Whitelist entry deleted",
    });
  } catch (error) {
    logger.error({ error }, "[OTP] Whitelist delete failed");
    res.status(500).json({ error: "Failed to delete whitelist entry" });
  }
});

export default router;
🔐 3. AUTH FLOW INTEGRATION
File: artifacts/api-server/src/routes/auth-otp-bypass.ts (Helper Module)
TypeScript
import { db } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { usersTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

export interface OTPBypassStatus {
  isBypassed: boolean;
  reason: "per_user" | "global" | "whitelist" | null;
  expiresAt: Date | null;
  bypassCode?: string;
}

/**
 * Check if OTP can be bypassed for given phone
 */
export async function checkOTPBypass(
  phone: string,
  settings: Record<string, string>
): Promise<OTPBypassStatus> {
  const now = new Date();

  try {
    // Priority 1: Per-user bypass
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (user && user.otpBypassUntil && user.otpBypassUntil > now) {
      return {
        isBypassed: true,
        reason: "per_user",
        expiresAt: user.otpBypassUntil,
      };
    }

    // Priority 2: Global OTP disable
    const globalDisabledUntil = settings["otp_global_disabled_until"];
    if (globalDisabledUntil) {
      const disabledUntilDate = new Date(globalDisabledUntil);
      if (disabledUntilDate > now) {
        return {
          isBypassed: true,
          reason: "global",
          expiresAt: disabledUntilDate,
        };
      }
    }

    // Priority 3: Whitelist bypass
    const [whitelisted] = await db.execute(
      sql`SELECT bypass_code FROM whitelist_users 
          WHERE identifier = ${phone} 
          AND is_active = true 
          AND (expires_at IS NULL OR expires_at > NOW())
          LIMIT 1`
    );

    if (whitelisted) {
      return {
        isBypassed: true,
        reason: "whitelist",
        expiresAt: null,
        bypassCode: (whitelisted as any).bypass_code,
      };
    }

    return {
      isBypassed: false,
      reason: null,
      expiresAt: null,
    };
  } catch (error) {
    logger.error({ error, phone }, "[OTPBypass] Check failed");
    return {
      isBypassed: false,
      reason: null,
      expiresAt: null,
    };
  }
}

/**
 * Log OTP bypass event
 */
export async function logOTPBypassEvent(
  eventType:
    | "login_otp_bypass"
    | "login_global_otp_bypass"
    | "login_whitelist_bypass"
    | "otp_send_bypassed",
  userId: string | null,
  phone: string,
  ip: string,
  reason: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO otp_bypass_audit (id, event_type, user_id, phone, bypass_reason, ip_address, metadata, created_at)
          VALUES (
            ${require("uuid").v4()},
            ${eventType},
            ${userId},
            ${phone},
            ${reason},
            ${ip},
            ${JSON.stringify(metadata || {})},
            NOW()
          )`
    );
  } catch (error) {
    logger.error({ error }, "[OTPBypass] Audit log failed");
  }
}
File: artifacts/api-server/src/routes/auth.ts (MODIFICATIONS)
TypeScript
// ADD THESE IMPORTS AT TOP
import {
  checkOTPBypass,
  logOTPBypassEvent,
} from "./auth-otp-bypass.js";

// MODIFY POST /auth/send-otp (around line 564)
// ADD THIS SECTION AFTER RATE LIMIT CHECK (around line 648):

// ──────────────────────────────────────────────────────
// CHECK OTP BYPASS - PART 1: SEND-OTP
// ──────────────────────────────────────────────────────

const bypassStatus = await checkOTPBypass(phone, settings);

if (bypassStatus.isBypassed) {
  writeAuthAuditLog("otp_send_bypassed", {
    ip,
    userAgent: req.headers["user-agent"] ?? undefined,
    metadata: {
      phone,
      reason: bypassStatus.reason,
      expiresAt: bypassStatus.expiresAt?.toISOString(),
    },
  });

  logOTPBypassEvent("otp_send_bypassed", null, phone, ip, bypassStatus.reason!, {
    expiresAt: bypassStatus.expiresAt?.toISOString(),
  });

  res.json({
    otpRequired: false,
    message: "OTP sent successfully",
    channel: bypassStatus.reason === "whitelist" ? "whitelist" : "bypass",
    fallbackChannels: [],
  });
  return;
}

// ──────────────────────────────────────────────────────
// MODIFY POST /auth/verify-otp (around line 859)
// ADD THIS SECTION BEFORE OTP CODE VALIDATION (around line 1077):

// ──────────────────────────────────────────────────────
// CHECK OTP BYPASS - PART 2: VERIFY-OTP
// ──────────────────────────────────────────────────────

const bypassStatus = await checkOTPBypass(phone, settings);

if (bypassStatus.isBypassed) {
  if (bypassStatus.reason === "whitelist") {
    // For whitelist, validate the bypass code is correct
    if (hashOtp(otp) !== hashOtp(bypassStatus.bypassCode!)) {
      const updated = await recordFailedAttempt(
        phone,
        maxAttempts,
        lockoutMinutes
      );
      const remaining = maxAttempts - updated.attempts;
      logOTPBypassEvent(
        "login_whitelist_bypass",
        user?.id || null,
        phone,
        ip,
        "whitelist_code_failed"
      );
      res.status(401).json({
        error: `Invalid whitelist code. ${remaining} attempt(s) remaining.`,
        attemptsRemaining: Math.max(0, remaining),
      });
      return;
    }
  }

  // Bypass is valid - issue token without OTP verification
  logOTPBypassEvent(
    `login_${bypassStatus.reason}_bypass`,
    user?.id || null,
    phone,
    ip,
    `bypass_active_${bypassStatus.reason}`
  );

  // Mark phone as verified
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({
        phoneVerified: true,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(usersTable.phone, phone));
  });

  // Re-fetch fresh user data
  const [freshUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (!freshUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Continue with token issuance (existing code)
  // ... (copy the token issuance section here)
}

// Otherwise, continue with normal OTP validation
📱 4. RIDER APP INTEGRATION
File: artifacts/rider-app/src/hooks/useOTPBypass.ts (NEW)
TypeScript
import { useEffect, useState } from "react";
import { logger } from "../lib/logger";

export interface AuthConfig {
  auth_mode: string;
  firebase_enabled: string;
  auth_otp_enabled: string;
  auth_email_enabled: string;
  auth_google_enabled: string;
  auth_facebook_enabled: string;
  otpBypassActive: boolean;
  otpBypassExpiresAt: string | null;
  bypassReason: "global_disable" | "maintenance" | null;
  bypassMessage: string | null;
}

export const useOTPBypass = () => {
  const [bypassActive, setBypassActive] = useState(false);
  const [bypassExpiresAt, setBypassExpiresAt] = useState<Date | null>(null);
  const [bypassMessage, setBypassMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuthConfig = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/auth/config", {
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) throw new Error("Failed to fetch auth config");

        const config: AuthConfig = await response.json();

        setBypassActive(config.otpBypassActive);
        if (config.otpBypassExpiresAt) {
          setBypassExpiresAt(new Date(config.otpBypassExpiresAt));
        }
        setBypassMessage(config.bypassMessage);

        // Cache for 5 minutes
        localStorage.setItem("authConfigCache", JSON.stringify(config));
        localStorage.setItem("authConfigCacheTime", Date.now().toString());
      } catch (error) {
        logger.error({ error }, "[useOTPBypass] Failed to fetch config");

        // Try to use cached config
        const cached = localStorage.getItem("authConfigCache");
        if (cached) {
          try {
            const config: AuthConfig = JSON.parse(cached);
            setBypassActive(config.otpBypassActive);
            if (config.otpBypassExpiresAt) {
              setBypassExpiresAt(new Date(config.otpBypassExpiresAt));
            }
            setBypassMessage(config.bypassMessage);
          } catch (e) {
            logger.error({ e }, "[useOTPBypass] Failed to parse cache");
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAuthConfig();

    // Refresh every 30 seconds
    const interval = setInterval(fetchAuthConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  const remainingSeconds = bypassExpiresAt
    ? Math.max(0, Math.ceil((bypassExpiresAt.getTime() - Date.now()) / 1000))
    : 0;

  const isExpired = remainingSeconds === 0 && bypassActive;

  return {
    bypassActive: bypassActive && !isExpired,
    bypassExpiresAt: isExpired ? null : bypassExpiresAt,
    bypassMessage: bypassMessage,
    remainingSeconds,
    loading,
  };
};
File: artifacts/rider-app/src/screens/OTPVerificationScreen.tsx (MODIFIED)
TypeScript
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useOTPBypass } from "../hooks/useOTPBypass";
import { logger } from "../lib/logger";

export const OTPVerificationScreen = ({ phone, onSuccess }: Props) => {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const { bypassActive, bypassExpiresAt, bypassMessage, remainingSeconds } =
    useOTPBypass();

  const handleVerifyOTP = async () => {
    try {
      setLoading(true);

      const otpToSubmit = bypassActive ? "000000" : otp;

      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          otp: otpToSubmit,
          role: "rider",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        Alert.alert("Error", error.error || "Verification failed");
        return;
      }

      const data = await response.json();
      localStorage.setItem("access_token", data.token);
      localStorage.setItem("refresh_token", data.refreshToken);
      onSuccess(data);
    } catch (error) {
      logger.error({ error }, "[OTPVerification] Failed");
      Alert.alert("Error", "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        Enter OTP
      </Text>
      <Text style={{ color: "#666", marginBottom: 20 }}>
        A code has been sent to {phone}
      </Text>

      {bypassActive && (
        <View
          style={{
            backgroundColor: "#fff3cd",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            borderLeftWidth: 4,
            borderLeftColor: "#ffc107",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 4 }}>
            ⚠️ OTP Verification Disabled
          </Text>
          <Text style={{ fontSize: 13, color: "#856404" }}>
            {bypassMessage || "OTP verification is temporarily disabled"}
          </Text>
          {bypassExpiresAt && (
            <Text style={{ fontSize: 12, color: "#856404", marginTop: 4 }}>
              Expires in {formatTime(remainingSeconds)}
            </Text>
          )}
        </View>
      )}

      {!bypassActive && (
        <TextInput
          placeholder="Enter 6-digit OTP"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            padding: 12,
            borderRadius: 8,
            fontSize: 18,
            marginBottom: 16,
            textAlign: "center",
          }}
        />
      )}

      <TouchableOpacity
        onPress={handleVerifyOTP}
        disabled={!bypassActive && otp.length !== 6}
        style={{
          backgroundColor: !bypassActive && otp.length !== 6 ? "#ccc" : "#007AFF",
          padding: 14,
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
            {bypassActive ? "Continue" : "Verify OTP"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};
🏪 5. VENDOR APP INTEGRATION
File: artifacts/vendor-app/src/hooks/useOTPBypass.ts
TypeScript
// SAME AS RIDER APP (copy above)
// Just change the import paths to vendor-app specific paths
File: artifacts/vendor-app/src/screens/OTPVerificationScreen.tsx
TypeScript
// SAME AS RIDER APP
// Just change role: "vendor" instead of "rider"
// Change branding text to "Vendor Login" instead of "Rider Login"
👥 6. CUSTOMER APP INTEGRATION
File: artifacts/ajkmart/app/hooks/useOTPBypass.ts
TypeScript
// SAME AS RIDER APP (copy useOTPBypass hook)
File: artifacts/ajkmart/app/auth/OTPInput.tsx
TypeScript
// SAME AS RIDER APP OTPVerificationScreen
// Just change role: "customer" instead of "rider"
🎛️ 7. ADMIN PANEL ENHANCEMENTS
File: artifacts/admin/src/pages/otp-control-v2.tsx
TypeScript
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertCircle, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { formatDistance } from "date-fns";
import { fetchAdmin } from "../lib/adminFetcher";

interface OTPStatus {
  isGloballyDisabled: boolean;
  disabledUntil: string | null;
  remainingSeconds: number;
  activeBypassCount: number;
  whitelistCount: number;
}

interface BypassUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  otpBypassUntil: string | null;
}

interface WhitelistEntry {
  id: string;
  identifier: string;
  label: string;
  bypass_code: string;
  is_active: boolean;
  expires_at: string | null;
}

interface AuditEntry {
  id: string;
  event_type: string;
  user_id: string;
  admin_id: string;
  phone: string;
  bypass_reason: string;
  expires_at: string;
  ip_address: string;
  created_at: string;
  metadata: Record<string, any>;
}

const OTPControlPage = () => {
  // ==================== STATE ====================
  const [suspendMinutes, setSuspendMinutes] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [grantMinutes, setGrantMinutes] = useState(15);
  const [whitelistIdentifier, setWhitelistIdentifier] = useState("");
  const [whitelistLabel, setWhitelistLabel] = useState("");
  const [whitelistBypassCode, setWhitelistBypassCode] = useState("000000");
  const [countdown, setCountdown] = useState(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout>();

  // ==================== QUERIES ====================
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["otp-status"],
    queryFn: async () => {
      const result = await fetchAdmin("GET", "/api/admin/otp/status");
      return result as OTPStatus;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: users = [] } = useQuery({
    queryKey: ["otp-bypass-users", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const result = await fetchAdmin(
        "GET",
        `/api/users/search?q=${encodeURIComponent(searchQuery)}&limit=20`
      );
      return (result as any)?.users || [];
    },
    enabled: searchQuery.length >= 2,
  });

  const { data: whitelist = [] } = useQuery({
    queryKey: ["otp-whitelist"],
    queryFn: async () => {
      const result = await fetchAdmin("GET", "/api/admin/whitelist");
      return (result as any)?.entries || [];
    },
    refetchInterval: 30000,
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["otp-audit"],
    queryFn: async () => {
      const result = await fetchAdmin("GET", "/api/admin/otp/audit?limit=50");
      return (result as any)?.entries || [];
    },
    refetchInterval: 60000,
  });

  // ==================== EFFECTS ====================
  useEffect(() => {
    if (status?.disabledUntil) {
      const endTime = new Date(status.disabledUntil).getTime();
      
      const updateCountdown = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
        setCountdown(remaining);
        
        if (remaining === 0) {
          clearInterval(countdownIntervalRef.current);
          refetchStatus();
        }
      };

      updateCountdown();
      countdownIntervalRef.current = setInterval(updateCountdown, 1000);

      return () => clearInterval(countdownIntervalRef.current);
    }
  }, [status?.disabledUntil, refetchStatus]);

  // ==================== HANDLERS ====================
  const handleSuspendOTP = async () => {
    try {
      await fetchAdmin("POST", "/api/admin/otp/disable", {
        minutes: suspendMinutes,
      });
      toast.success(`OTP suspended for ${suspendMinutes} minutes`);
      refetchStatus();
    } catch (error) {
      toast.error("Failed to suspend OTP");
    }
  };

  const handleRestoreOTP = async () => {
    try {
      await fetchAdmin("DELETE", "/api/admin/otp/disable");
      toast.success("OTP verification restored");
      refetchStatus();
    } catch (error) {
      toast.error("Failed to restore OTP");
    }
  };

  const handleGrantBypass = async (userId: string) => {
    try {
      const result = await fetchAdmin(
        "POST",
        `/api/admin/users/${userId}/otp/bypass`,
        { minutes: grantMinutes }
      );
      toast.success(`Bypass granted for ${grantMinutes} minutes`);
      setSearchQuery("");
      refetchStatus();
    } catch (error) {
      toast.error("Failed to grant bypass");
    }
  };

  const handleRevokeBypass = async (userId: string) => {
    try {
      await fetchAdmin("DELETE", `/api/admin/users/${userId}/otp/bypass`);
      toast.success("Bypass revoked");
      refetchStatus();
    } catch (error) {
      toast.error("Failed to revoke bypass");
    }
  };

  const handleAddWhitelist = async () => {
    try {
      await fetchAdmin("POST", "/api/admin/whitelist", {
        identifier: whitelistIdentifier,
        label: whitelistLabel,
        bypassCode: whitelistBypassCode,
      });
      toast.success("Whitelist entry added");
      setWhitelistIdentifier("");
      setWhitelistLabel("");
      setWhitelistBypassCode("000000");
    } catch (error) {
      toast.error("Failed to add whitelist entry");
    }
  };

  const handleDeleteWhitelist = async (id: string) => {
    try {
      await fetchAdmin("DELETE", `/api/admin/whitelist/${id}`);
      toast.success("Whitelist entry deleted");
    } catch (error) {
      toast.error("Failed to delete whitelist entry");
    }
  };

  // ==================== FORMATTERS ====================
  const formatTime = (seconds: number) => {
    if (seconds === 0) return "Expired";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatDateTime = (dateString: string) => {
    try {
      return formatDistance(new Date(dateString), new Date(), {
        addSuffix: true,
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">OTP Control Center</h1>
        <Badge variant={status?.isGloballyDisabled ? "destructive" : "default"}>
          {status?.isGloballyDisabled ? "🔴 Suspended" : "🟢 Active"}
        </Badge>
      </div>

      {/* ==================== GLOBAL SUSPENSION ==================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Global OTP Suspension
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.isGloballyDisabled && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">
                  OTP is currently suspended
                </p>
                <p className="text-sm text-red-800 mt-1">
                  Remaining: {formatTime(countdown)}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <Input
              type="number"
              min="1"
              max="1440"
              value={suspendMinutes}
              onChange={(e) => setSuspendMinutes(parseInt(e.target.value))}
              placeholder="Minutes"
              className="w-32"
            />
            <Button onClick={handleSuspendOTP} variant="destructive">
              Suspend OTP
            </Button>
            {status?.isGloballyDisabled && (
              <Button onClick={handleRestoreOTP} variant="outline">
                Restore OTP
              </Button>
            )}
          </div>

          <p className="text-sm text-gray-600">
            Active Bypasses: <strong>{status?.activeBypassCount || 0}</strong>
          </p>
        </CardContent>
      </Card>

      {/* ==================== PER-USER BYPASS ==================== */}
      <Card>
        <CardHeader>
          <CardTitle>Per-User OTP Bypass</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Input
              type="number"
              min="1"
              max="1440"
              value={grantMinutes}
              onChange={(e) => setGrantMinutes(parseInt(e.target.value))}
              placeholder="Bypass duration (minutes)"
              className="w-40"
            />
          </div>

          {searchQuery.length >= 2 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-sm text-gray-500">No users found</p>
              ) : (
                users.map((user: BypassUser) => (
                  <div
                    key={user.id}
                    className="flex justify-between items-center p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-sm text-gray-600">{user.phone}</p>
                      {user.otpBypassUntil && (
                        <p className="text-xs text-amber-600">
                          Bypass: {formatDateTime(user.otpBypassUntil)}
                        </p>
                      )}
                    </div>
                    {user.otpBypassUntil ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevokeBypass(user.id)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleGrantBypass(user.id)}
                      >
                        Grant ({grantMinutes}m)
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== WHITELIST ==================== */}
      <Card>
        <CardHeader>
          <CardTitle>Whitelist Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Input
              placeholder="Phone or Email"
              value={whitelistIdentifier}
              onChange={(e) => setWhitelistIdentifier(e.target.value)}
            />
            <Input
              placeholder="Label (optional)"
              value={whitelistLabel}
              onChange={(e) => setWhitelistLabel(e.target.value)}
            />
            <Input
              placeholder="Bypass Code"
              value={whitelistBypassCode}
              onChange={(e) => setWhitelistBypassCode(e.target.value)}
              maxLength={6}
            />
            <Button onClick={handleAddWhitelist}>Add Entry</Button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {whitelist.map((entry: WhitelistEntry) => (
              <div
                key={entry.id}
                className="flex justify-between items-center p-3 border rounded-lg"
              >
                <div>
                  <p className="font-semibold">{entry.identifier}</p>
                  {entry.label && (
                    <p className="text-sm text-gray-600">{entry.label}</p>
                  )}
                  {entry.expires_at && (
                    <p className="text-xs text-gray-500">
                      Expires: {formatDateTime(entry.expires_at)}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteWhitelist(entry.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ==================== AUDIT LOG ==================== */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {audit.length === 0 ? (
              <p className="text-sm text-gray-500">No bypass events yet</p>
            ) : (
              audit.map((entry: AuditEntry) => (
                <div
                  key={entry.id}
                  className="text-sm p-3 border rounded-lg bg-gray-50"
                >
                  <div className="flex justify-between">
                    <p className="font-semibold">
                      {entry.event_type.replace(/_/g, " ").toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                  <p className="text-gray-600">
                    {entry.phone} {entry.bypass_reason && `(${entry.bypass_reason})`}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OTPControlPage;
🗂️ 8. TYPE DEFINITIONS
File: artifacts/api-server/src/types/otp-bypass.ts
TypeScript
export interface OTPBypassRequest {
  minutes?: number;
}

export interface OTPBypassResponse {
  success: boolean;
  message: string;
  bypassUntil?: string;
  minutesGranted?: number;
  userPhone?: string;
  userName?: string;
}

export interface WhitelistEntry {
  id: string;
  identifier: string;
  label?: string;
  bypass_code: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OTPAuditEntry {
  id: string;
  event_type:
    | "login_otp_bypass"
    | "login_global_otp_bypass"
    | "login_whitelist_bypass"
    | "otp_send_bypassed"
    | "otp_bypass_granted"
    | "otp_bypass_revoked";
  user_id?: string;
  admin_id?: string;
  phone: string;
  email?: string;
  bypass_reason: string;
  expires_at?: string;
  ip_address: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface OTPBypassStatus {
  isBypassed: boolean;
  reason: "per_user" | "global" | "whitelist" | null;
  expiresAt: Date | null;
  bypassCode?: string;
}
🛠️ 9. UTILITY FUNCTIONS
File: artifacts/api-server/src/lib/otp-utils.ts
TypeScript
import { createHash } from "crypto";

/**
 * Hash OTP code for storage
 */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Validate bypass code format
 */
export function isValidBypassCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Format remaining seconds as readable time
 */
export function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Pakistani phone format
  return /^[\d\s\-+()]{7,15}$/.test(phone);
}

/**
 * Check if bypass has expired
 */
export function isBypassExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt < new Date();
}

/**
 * Generate random bypass code
 */
export function generateRandomBypassCode(): string {
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
}
✅ 10. COMPLETE SETUP GUIDE
File: SETUP_OTP_CONTROL.md
Markdown
# OTP Control System - Setup Guide

## Installation Steps

### 1. Database Migration
```bash
# Run migration to create tables
cd artifacts/api-server
npm run migrate -- add-otp-bypass-system
2. Backend API Setup
Add /routes/admin/otp-control.ts to your routes directory
Add /routes/auth-otp-bypass.ts as helper module
Update /routes/auth.ts with bypass checks
Register routes in main server file:
TypeScript
import otpControlRoutes from "./routes/admin/otp-control.js";
app.use("/api/admin/otp", otpControlRoutes);
app.use("/api/admin/whitelist", otpControlRoutes);
3. Frontend Setup
Rider App:

bash
cp artifacts/rider-app/src/hooks/useOTPBypass.ts src/hooks/
cp artifacts/rider-app/src/screens/OTPVerificationScreen.tsx src/screens/
Vendor App:

bash
cp artifacts/vendor-app/src/hooks/useOTPBypass.ts src/hooks/
cp artifacts/vendor-app/src/screens/OTPVerificationScreen.tsx src/screens/
Admin Panel:

bash
cp artifacts/admin/src/pages/otp-control-v2.tsx src/pages/
4. Verify Installation
bash
# Check API endpoints
curl http://localhost:3000/api/admin/otp/status

# Check database tables
SHOW TABLES LIKE '%whitelist%';
SHOW TABLES LIKE '%otp_bypass_audit%';