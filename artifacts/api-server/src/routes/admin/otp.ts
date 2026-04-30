import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, platformSettingsTable, authAuditLogTable, otpBypassAuditTable, whitelistUsersTable } from "@workspace/db/schema";
import { eq, desc, and, sql, inArray, type SQL } from "drizzle-orm";
import {
  addAuditEntry, getClientIp, getPlatformSettings, invalidateSettingsCache,
  type AdminRequest,
} from "../admin-shared.js";

function generateBypassCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
import { sendSuccess, sendNotFound, sendValidationError } from "../../lib/response.js";
import { generateSecureOtp } from "../../services/password.js";
import { generateId } from "../../lib/id.js";
import { createHash } from "crypto";
import { writeAuthAuditLog } from "../../middleware/security.js";
import { AuditService } from "../../services/admin-audit.service.js";
import { UserService } from "../../services/admin-user.service.js";

const router = Router();

/* ─── GET /admin/otp/status ───────────────────────────────────────────────── */
router.get("/otp/status", async (_req, res) => {
  try {
    const status = await UserService.getOtpStatus();
    sendSuccess(res, status);
  } catch (error: any) {
    sendValidationError(res, error.message || String(error));
  }
});

/* ─── POST /admin/otp/disable ─────────────────────────────────────────────── */
router.post("/otp/disable", async (req, res) => {
  const minutes = Number(req.body?.minutes);
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_global_disable",
        resourceType: "otp_config",
        resource: "global_disable",
        details: `Disabled OTP for ${minutes} minutes`,
      },
      () => UserService.disableOtpGlobally(minutes)
    );

    writeAuthAuditLog("admin_otp_global_disable", {
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { adminId: adminReq.adminId, minutes, disabledUntil: result.disabledUntil, result: "success" },
    });

    sendSuccess(res, result);
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── DELETE /admin/otp/disable ───────────────────────────────────────────── */
router.delete("/otp/disable", async (req, res) => {
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_global_restore",
        resourceType: "otp_config",
        resource: "global_restore",
        details: "Restored global OTP (early restore)",
      },
      () => UserService.restoreOtpGlobally()
    );

    writeAuthAuditLog("admin_otp_global_restore", {
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { adminId: adminReq.adminId, result: "success" },
    });

    sendSuccess(res, result);
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── GET /admin/otp/audit ─────────────────────────────────────────────── */
router.get("/otp/audit", async (req, res) => {
  const { userId, from, to, page } = req.query as Record<string, string>;

  try {
    const result = await UserService.getOtpAuditLog({
      userId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
    });
    sendSuccess(res, result);
  } catch (error: any) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("Invalid")) {
      res.status(400).json({ error: "Failed to fetch OTP audit log", details: errMsg });
    } else {
      res.status(500).json({ error: "Failed to fetch OTP audit log", details: errMsg });
    }
  }
});

/* ─── GET /admin/otp/channels ─────────────────────────────────────────────── */
router.get("/otp/channels", async (_req, res) => {
  try {
    const result = await UserService.getOtpChannels();
    sendSuccess(res, result);
  } catch (error: any) {
    sendValidationError(res, error.message || String(error));
  }
});

/* ─── PATCH /admin/otp/channels ───────────────────────────────────────────── */
router.patch("/otp/channels", async (req, res) => {
  const { channels } = req.body;
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_channels_update",
        resourceType: "otp_config",
        resource: "channels",
        details: `Updated OTP channel priority: ${channels?.join(" → ")}`,
      },
      () => UserService.updateOtpChannels(channels)
    );

    sendSuccess(res, result);
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── POST /admin/users/:id/otp/generate ─────────────────────────────────── */
router.post("/users/:id/otp/generate", async (req, res) => {
  const userId = req.params["id"]!;
  const adminReq = req as AdminRequest;

  try {
    const result = await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_generate",
        resourceType: "user",
        resource: userId,
        details: `Generated OTP for user ${userId}`,
      },
      () => UserService.generateOtpForUser(userId)
    );

    writeAuthAuditLog("admin_otp_generate", {
      userId,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      metadata: { phone: result.phone, adminId: adminReq.adminId },
    });

    sendSuccess(res, { otp: result.otp, expiresAt: result.expiresAt });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("not found")) {
      sendNotFound(res, "User not found");
    } else {
      sendValidationError(res, errMsg);
    }
  }
});

/* ──────────────────────────────────────────────────────────────────────────── */
/* PER-USER OTP BYPASS ENDPOINTS                                              */
/* ──────────────────────────────────────────────────────────────────────────── */

/* ─── POST /admin/users/:id/otp/bypass ────────────────────────────────────────*/
router.post("/users/:id/otp/bypass", async (req, res) => {
  const userId = req.params["id"]!;
  const minutes = Number(req.body?.minutes || 0);
  const adminReq = req as AdminRequest;

  if (!minutes || minutes <= 0 || minutes > 1440) {
    return sendValidationError(res, "Minutes must be between 1 and 1440");
  }

  try {
    // Verify user exists
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { id: true, phone: true, email: true, name: true },
    });

    if (!user) {
      return sendNotFound(res, "User not found");
    }

    const bypassUntil = new Date(Date.now() + minutes * 60 * 1000);

    // Update user
    await db
      .update(usersTable)
      .set({ otpBypassUntil: bypassUntil, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    // Log to audit
    await db.insert(otpBypassAuditTable).values({
      id: generateId(),
      eventType: "otp_bypass_granted",
      userId,
      adminId: adminReq.adminId,
      phone: user.phone,
      email: user.email,
      bypassReason: "admin_grant",
      expiresAt: bypassUntil,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] as string,
      metadata: { minutes },
    });

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_bypass_grant",
        resourceType: "user",
        resource: userId,
        details: `Granted OTP bypass to ${user.phone || user.email} for ${minutes} minutes`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, {
      bypassUntil: bypassUntil.toISOString(),
      minutesGranted: minutes,
      userPhone: user.phone,
      userName: user.name,
    });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── DELETE /admin/users/:id/otp/bypass ──────────────────────────────────────*/
router.delete("/users/:id/otp/bypass", async (req, res) => {
  const userId = req.params["id"]!;
  const adminReq = req as AdminRequest;

  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { id: true, phone: true, email: true, name: true, otpBypassUntil: true },
    });

    if (!user) {
      return sendNotFound(res, "User not found");
    }

    // Clear bypass
    await db
      .update(usersTable)
      .set({ otpBypassUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    // Log to audit
    await db.insert(otpBypassAuditTable).values({
      id: generateId(),
      eventType: "otp_bypass_revoked",
      userId,
      adminId: adminReq.adminId,
      phone: user.phone,
      email: user.email,
      bypassReason: "admin_revoke",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] as string,
    });

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_otp_bypass_revoke",
        resourceType: "user",
        resource: userId,
        details: `Revoked OTP bypass for ${user.phone || user.email}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, {
      message: `Bypass revoked for ${user.phone || user.email}`,
    });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ──────────────────────────────────────────────────────────────────────────── */
/* WHITELIST CRUD ENDPOINTS                                                   */
/* ──────────────────────────────────────────────────────────────────────────── */

/* ─── GET /admin/whitelist ────────────────────────────────────────────────────*/
router.get("/whitelist", async (_req, res) => {
  try {
    const entries = await db.query.whitelistUsersTable.findMany({
      orderBy: desc(whitelistUsersTable.createdAt),
    });

    sendSuccess(res, { entries });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── POST /admin/whitelist ───────────────────────────────────────────────────*/
router.post("/whitelist", async (req, res) => {
  const { identifier, label, bypassCode, expiresAt } = req.body;
  const adminReq = req as AdminRequest;
  const code = (bypassCode || generateBypassCode()).trim();

  if (!identifier || identifier.length < 7) {
    return sendValidationError(res, "Identifier must be at least 7 characters (phone or email)");
  }

  if (!/^\d{6}$/.test(code)) {
    return sendValidationError(res, "Bypass code must be exactly 6 digits");
  }

  let expires: Date | null = null;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return sendValidationError(res, "Expires At must be a valid date/time");
    }
    expires = parsed;
  }

  try {
    // Check if already exists
    const existing = await db.query.whitelistUsersTable.findFirst({
      where: eq(whitelistUsersTable.identifier, identifier),
      columns: { id: true },
    });

    if (existing) {
      return res.status(409).json({ error: "Identifier already whitelisted" });
    }

    const id = generateId();

    await db.insert(whitelistUsersTable).values({
      id,
      identifier,
      label: label || null,
      bypassCode: code,
      isActive: true,
      expiresAt: expires,
      createdBy: adminReq.adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_whitelist_entry_add",
        resourceType: "whitelist",
        resource: id,
        details: `Added whitelist entry: ${identifier}${label ? ` (${label})` : ""}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, {
      entry: {
        id,
        identifier,
        label: label || null,
        bypassCode: code,
        isActive: true,
        expiresAt: expires ? expires.toISOString() : null,
      },
    });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── PATCH /admin/whitelist/:id ──────────────────────────────────────────────*/
router.patch("/whitelist/:id", async (req, res) => {
  const id = req.params["id"]!;
  const updates = req.body;
  const adminReq = req as AdminRequest;

  try {
    const existing = await db.query.whitelistUsersTable.findFirst({
      where: eq(whitelistUsersTable.id, id),
    });

    if (!existing) {
      return sendNotFound(res, "Whitelist entry not found");
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (updates.label !== undefined) {
      updateData.label = updates.label;
    }

    if (updates.bypassCode) {
      if (!/^\d{6}$/.test(updates.bypassCode)) {
        return sendValidationError(res, "Bypass code must be exactly 6 digits");
      }
      updateData.bypassCode = updates.bypassCode;
    }

    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }

    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
    }

    await db
      .update(whitelistUsersTable)
      .set(updateData)
      .where(eq(whitelistUsersTable.id, id));

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_whitelist_entry_update",
        resourceType: "whitelist",
        resource: id,
        details: `Updated whitelist entry: ${existing.identifier}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, { message: "Whitelist entry updated" });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

/* ─── DELETE /admin/whitelist/:id ─────────────────────────────────────────────*/
router.delete("/whitelist/:id", async (req, res) => {
  const id = req.params["id"]!;
  const adminReq = req as AdminRequest;

  try {
    const existing = await db.query.whitelistUsersTable.findFirst({
      where: eq(whitelistUsersTable.id, id),
      columns: { id: true, identifier: true },
    });

    if (!existing) {
      return sendNotFound(res, "Whitelist entry not found");
    }

    await db.delete(whitelistUsersTable).where(eq(whitelistUsersTable.id, id));

    await AuditService.executeWithAudit(
      {
        adminId: adminReq.adminId,
        adminName: adminReq.adminName,
        adminIp: getClientIp(req),
        action: "admin_whitelist_entry_delete",
        resourceType: "whitelist",
        resource: id,
        details: `Deleted whitelist entry: ${existing.identifier}`,
      },
      async () => ({ success: true })
    );

    sendSuccess(res, { message: "Whitelist entry deleted" });
  } catch (error: any) {
    const errMsg = error.message || String(error);
    sendValidationError(res, errMsg);
  }
});

export default router;
