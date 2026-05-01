import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  accountConditionsTable,
  conditionRulesTable,
  conditionSettingsTable,
  vanBookingsTable,
  vanSchedulesTable,
  vanDriversTable,
  reviewsTable,
  ordersTable,
  locationLogsTable,
  chatReportsTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, inArray, lte, ilike, or, sql } from "drizzle-orm";
import { generateId } from "../../lib/id.js";

const router = Router();

const SEVERITY_RANK: Record<string, number> = {
  warning: 1,
  restriction_normal: 2,
  restriction_strict: 3,
  suspension: 4,
  ban: 5,
};

const SEVERITY_TO_CATEGORY: Record<string, string> = {
  warning: "warning",
  restriction_normal: "restriction",
  restriction_strict: "restriction",
  suspension: "suspension",
  ban: "ban",
};

const TYPE_TO_SEVERITY: Record<string, string> = {
  warning_l1: "warning", warning_l2: "warning", warning_l3: "warning",
  restriction_service_block: "restriction_normal",
  restriction_wallet_freeze: "restriction_normal",
  restriction_promo_block: "restriction_normal",
  restriction_order_cap: "restriction_normal",
  restriction_review_block: "restriction_normal",
  restriction_cash_only: "restriction_normal",
  restriction_new_order_block: "restriction_strict",
  restriction_rate_limit: "restriction_strict",
  restriction_pending_review_gate: "restriction_strict",
  restriction_device_restriction: "restriction_strict",
  suspension_temporary: "suspension",
  suspension_extended: "suspension",
  suspension_pending_review: "suspension",
  ban_soft: "ban", ban_hard: "ban", ban_fraud: "ban",
};

const ESCALATION_MAP: Record<string, string> = {
  warning_l1: "warning_l2",
  warning_l2: "warning_l3",
  warning_l3: "restriction_service_block",
  restriction_service_block: "restriction_new_order_block",
  restriction_wallet_freeze: "restriction_new_order_block",
  restriction_promo_block: "restriction_new_order_block",
  restriction_order_cap: "restriction_new_order_block",
  restriction_review_block: "restriction_new_order_block",
  restriction_cash_only: "restriction_new_order_block",
  restriction_new_order_block: "suspension_temporary",
  restriction_rate_limit: "suspension_temporary",
  restriction_pending_review_gate: "suspension_pending_review",
  restriction_device_restriction: "suspension_temporary",
  suspension_temporary: "suspension_extended",
  suspension_extended: "ban_soft",
  suspension_pending_review: "ban_soft",
  ban_soft: "ban_hard",
  ban_hard: "ban_fraud",
};

async function getUserRole(userId: string): Promise<string> {
  const [u] = await db.select({ roles: usersTable.roles })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u?.roles) return "customer";
  return u.roles.split(",")[0]?.trim() || "customer";
}

/** Returns ALL roles a user has, including the synthetic "van_driver" role
 *  if they're an approved + active van driver. Used by the rule engine to
 *  match rules whose targetRole is "van_driver". */
async function getUserRoleSet(userId: string): Promise<Set<string>> {
  const roles = new Set<string>();
  const [u] = await db.select({ roles: usersTable.roles })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (u?.roles) {
    for (const r of u.roles.split(",")) {
      const t = r.trim();
      if (t) roles.add(t);
    }
  }
  if (roles.size === 0) roles.add("customer");
  const [vd] = await db
    .select({ approvalStatus: vanDriversTable.approvalStatus, isActive: vanDriversTable.isActive })
    .from(vanDriversTable)
    .where(eq(vanDriversTable.userId, userId))
    .limit(1);
  if (vd && vd.isActive && vd.approvalStatus === "approved") {
    roles.add("van_driver");
  }
  return roles;
}

export async function reconcileUserFlags(userId: string): Promise<{ success: boolean; conditions?: number; error?: string }> {
  try {
    const conditions = await db
      .select()
      .from(accountConditionsTable)
      .where(and(eq(accountConditionsTable.userId, userId), eq(accountConditionsTable.isActive, true)));
    return { success: true, conditions: conditions.length };
  } catch (err) {
    console.error("reconcileUserFlags error:", err);
    return { success: false, error: String(err) };
  }
}

/* ─────────────── AUDIT LOG HELPER ─────────────── */
async function logRuleAudit(
  action: string,
  rule: Record<string, any>,
  changedBy: string,
  diff?: Record<string, any>,
) {
  try {
    await db.execute(sql`
      INSERT INTO condition_rule_audit_log (id, rule_id, action, changed_by, snapshot, diff, created_at)
      VALUES (
        ${generateId()},
        ${rule.id ?? null},
        ${action},
        ${changedBy},
        ${JSON.stringify(rule)}::jsonb,
        ${diff ? JSON.stringify(diff) : null}::jsonb,
        now()
      )
    `);
  } catch (err) {
    console.warn("[audit-log] Failed to write audit entry:", err);
  }
}

/* ─────────────── CONDITIONS LIST ─────────────── */
router.get("/conditions", async (req, res) => {
  try {
    const { userId, role, severity, status, search, dateFrom, dateTo } = req.query as Record<string, string>;

    const where: any[] = [];
    if (userId) where.push(eq(accountConditionsTable.userId, userId));
    if (role && role !== "all") where.push(eq(accountConditionsTable.userRole, role));
    if (severity && severity !== "all") where.push(eq(accountConditionsTable.severity, severity as any));
    if (status === "active") where.push(eq(accountConditionsTable.isActive, true));
    if (status === "lifted") where.push(eq(accountConditionsTable.isActive, false));
    if (dateFrom) where.push(gte(accountConditionsTable.appliedAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.push(lte(accountConditionsTable.appliedAt, end));
    }

    const rows = await db
      .select({
        id: accountConditionsTable.id,
        userId: accountConditionsTable.userId,
        userRole: accountConditionsTable.userRole,
        conditionType: accountConditionsTable.conditionType,
        severity: accountConditionsTable.severity,
        category: accountConditionsTable.category,
        reason: accountConditionsTable.reason,
        notes: accountConditionsTable.notes,
        appliedBy: accountConditionsTable.appliedBy,
        appliedAt: accountConditionsTable.appliedAt,
        expiresAt: accountConditionsTable.expiresAt,
        liftedAt: accountConditionsTable.liftedAt,
        liftedBy: accountConditionsTable.liftedBy,
        liftReason: accountConditionsTable.liftReason,
        isActive: accountConditionsTable.isActive,
        metadata: accountConditionsTable.metadata,
        userName: usersTable.name,
        userPhone: usersTable.phone,
      })
      .from(accountConditionsTable)
      .leftJoin(usersTable, eq(accountConditionsTable.userId, usersTable.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(accountConditionsTable.appliedAt));

    let conditions = rows;
    if (search) {
      const q = search.toLowerCase();
      conditions = rows.filter(
        (c) =>
          (c.userName ?? "").toLowerCase().includes(q) ||
          (c.userPhone ?? "").toLowerCase().includes(q) ||
          (c.reason ?? "").toLowerCase().includes(q),
      );
    }

    const activeConditions = conditions.filter((c) => c.isActive);
    const severityCounts: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};
    for (const c of activeConditions) {
      severityCounts[c.severity] = (severityCounts[c.severity] || 0) + 1;
      roleCounts[c.userRole] = (roleCounts[c.userRole] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        conditions,
        activeCount: activeConditions.length,
        severityCounts,
        roleCounts,
      },
    });
  } catch (error) {
    console.error("[admin/conditions] list error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.get("/conditions/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const conditions = await db
      .select()
      .from(accountConditionsTable)
      .where(eq(accountConditionsTable.userId, userId))
      .orderBy(desc(accountConditionsTable.appliedAt));
    res.json({ success: true, data: { conditions } });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.post("/conditions", async (req, res) => {
  try {
    const { userId, conditionType, reason, notes, expiresAt, appliedBy, metadata } = req.body ?? {};
    if (!userId || !conditionType || !reason) {
      return res.status(400).json({ success: false, error: "Missing required fields: userId, conditionType, reason" });
    }
    const severity = req.body.severity || TYPE_TO_SEVERITY[conditionType] || "warning";
    const category = req.body.category || SEVERITY_TO_CATEGORY[severity] || "warning";
    const userRole = req.body.userRole || (await getUserRole(userId));

    const [created] = await db
      .insert(accountConditionsTable)
      .values({
        id: generateId(),
        userId,
        userRole,
        conditionType,
        severity: severity as any,
        category,
        reason,
        notes: notes ?? null,
        appliedBy: appliedBy ?? "admin",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        metadata: metadata ?? null,
      })
      .returning();

    res.json({ success: true, data: created });
    return;
  } catch (error) {
    console.error("[admin/conditions] create error:", error);
    res.status(500).json({ success: false, error: String(error) });
    return;
  }
});

router.patch("/conditions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { action, liftReason, reason, ...rest } = req.body ?? {};

    const [existing] = await db.select().from(accountConditionsTable).where(eq(accountConditionsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ success: false, error: "Condition not found" });

    if (action === "lift") {
      const [updated] = await db
        .update(accountConditionsTable)
        .set({
          isActive: false,
          liftedAt: new Date(),
          liftedBy: req.body.liftedBy || "admin",
          liftReason: liftReason || "Lifted by admin",
          updatedAt: new Date(),
        })
        .where(eq(accountConditionsTable.id, id))
        .returning();
      return res.json({ success: true, data: updated });
    }

    if (action === "escalate") {
      const nextType = ESCALATION_MAP[existing.conditionType] || existing.conditionType;
      const nextSeverity = TYPE_TO_SEVERITY[nextType] || existing.severity;
      const nextCategory = SEVERITY_TO_CATEGORY[nextSeverity] || existing.category;
      await db
        .update(accountConditionsTable)
        .set({
          isActive: false,
          liftedAt: new Date(),
          liftedBy: req.body.liftedBy || "admin",
          liftReason: `Escalated to ${nextType}`,
          updatedAt: new Date(),
        })
        .where(eq(accountConditionsTable.id, id));
      const [created] = await db
        .insert(accountConditionsTable)
        .values({
          id: generateId(),
          userId: existing.userId,
          userRole: existing.userRole,
          conditionType: nextType as any,
          severity: nextSeverity as any,
          category: nextCategory,
          reason: reason || `Escalated from ${existing.conditionType}`,
          notes: existing.notes,
          appliedBy: req.body.appliedBy || "admin",
          isActive: true,
          metadata: { escalatedFrom: existing.id },
        })
        .returning();
      return res.json({ success: true, data: created });
    }

    const [updated] = await db
      .update(accountConditionsTable)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(accountConditionsTable.id, id))
      .returning();
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("[admin/conditions] update error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.delete("/conditions/:id", async (req, res) => {
  try {
    await db.delete(accountConditionsTable).where(eq(accountConditionsTable.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.post("/conditions/bulk", async (req, res) => {
  try {
    const { ids, action, reason } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return res.status(400).json({ success: false, error: "ids[] and action required" });
    }
    if (action === "lift") {
      const result = await db
        .update(accountConditionsTable)
        .set({
          isActive: false,
          liftedAt: new Date(),
          liftedBy: "admin",
          liftReason: reason || "Bulk lift by admin",
          updatedAt: new Date(),
        })
        .where(and(inArray(accountConditionsTable.id, ids), eq(accountConditionsTable.isActive, true)))
        .returning({ id: accountConditionsTable.id });
      return res.json({ success: true, affected: result.length });
    }
    if (action === "delete") {
      const result = await db
        .delete(accountConditionsTable)
        .where(inArray(accountConditionsTable.id, ids))
        .returning({ id: accountConditionsTable.id });
      return res.json({ success: true, affected: result.length });
    }
    return res.status(400).json({ success: false, error: "Unsupported action" });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── CONDITION RULES (CRUD) ─────────────── */
router.get("/condition-rules", async (_req, res) => {
  try {
    const rules = await db.select().from(conditionRulesTable).orderBy(desc(conditionRulesTable.createdAt));

    // Attach lastFiredAt from audit log for each rule
    const ruleIds = rules.map((r) => r.id);
    let lastFiredMap: Record<string, string> = {};
    if (ruleIds.length > 0) {
      const fired = await db.execute(sql`
        SELECT DISTINCT ON (rule_id) rule_id, created_at
        FROM condition_rule_audit_log
        WHERE rule_id = ANY(${ruleIds}::text[]) AND action = 'fired'
        ORDER BY rule_id, created_at DESC
      `);
      for (const row of fired.rows as any[]) {
        lastFiredMap[row.rule_id] = row.created_at;
      }
    }

    const enriched = rules.map((r) => ({
      ...r,
      lastFiredAt: lastFiredMap[r.id] ?? null,
    }));

    res.json({ success: true, data: { rules: enriched } });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.post("/condition-rules", async (req, res) => {
  try {
    const {
      name, description, targetRole, metric, operator, threshold,
      conditionType, severity, cooldownHours, modeApplicability, isActive,
      changedBy,
    } = req.body ?? {};

    if (!name || !targetRole || !metric || !operator || threshold === undefined || threshold === "" || !conditionType) {
      return res.status(400).json({ success: false, error: "Missing required rule fields" });
    }

    const sev = severity || TYPE_TO_SEVERITY[conditionType] || "warning";
    const [created] = await db
      .insert(conditionRulesTable)
      .values({
        id: generateId(),
        name,
        description: description ?? null,
        targetRole,
        metric,
        operator,
        threshold: String(threshold),
        conditionType,
        severity: sev as any,
        cooldownHours: cooldownHours != null ? Number(cooldownHours) : 24,
        modeApplicability: modeApplicability ?? "default,ai_recommended,custom",
        isActive: isActive ?? true,
      })
      .returning();

    await logRuleAudit("created", created, changedBy || "admin");
    return res.json({ success: true, data: created });
  } catch (error) {
    console.error("[admin/condition-rules] create error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.patch("/condition-rules/:id", async (req, res) => {
  try {
    const { changedBy, ...body } = req.body ?? {};
    const [before] = await db.select().from(conditionRulesTable).where(eq(conditionRulesTable.id, req.params.id)).limit(1);

    const updates: any = { ...body, updatedAt: new Date() };
    if (updates.threshold !== undefined) updates.threshold = String(updates.threshold);
    if (updates.cooldownHours !== undefined) updates.cooldownHours = Number(updates.cooldownHours);
    const [updated] = await db
      .update(conditionRulesTable)
      .set(updates)
      .where(eq(conditionRulesTable.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ success: false, error: "Rule not found" });

    if (before) {
      const diff: Record<string, any> = {};
      for (const k of Object.keys(body)) {
        const bv = (before as any)[k];
        const av = (updated as any)[k];
        if (String(bv) !== String(av)) diff[k] = { from: bv, to: av };
      }
      await logRuleAudit("updated", updated, changedBy || "admin", diff);
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.delete("/condition-rules/:id", async (req, res) => {
  try {
    const { changedBy } = req.body ?? {};
    const [before] = await db.select().from(conditionRulesTable).where(eq(conditionRulesTable.id, req.params.id)).limit(1);
    await db.delete(conditionRulesTable).where(eq(conditionRulesTable.id, req.params.id));
    if (before) await logRuleAudit("deleted", before, changedBy || "admin");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── BULK CONDITION RULES ─────────────── */
router.post("/condition-rules/bulk", async (req, res) => {
  try {
    const { ids, action, changedBy } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return res.status(400).json({ success: false, error: "ids[] and action required" });
    }
    if (action === "enable" || action === "disable") {
      const isActive = action === "enable";
      const result = await db
        .update(conditionRulesTable)
        .set({ isActive, updatedAt: new Date() })
        .where(inArray(conditionRulesTable.id, ids))
        .returning();
      for (const r of result) {
        await logRuleAudit(isActive ? "updated" : "updated", r, changedBy || "admin", { isActive: { from: !isActive, to: isActive } });
      }
      return res.json({ success: true, affected: result.length });
    }
    if (action === "delete") {
      const toDelete = await db.select().from(conditionRulesTable).where(inArray(conditionRulesTable.id, ids));
      await db.delete(conditionRulesTable).where(inArray(conditionRulesTable.id, ids));
      for (const r of toDelete) {
        await logRuleAudit("deleted", r, changedBy || "admin");
      }
      return res.json({ success: true, affected: toDelete.length });
    }
    return res.status(400).json({ success: false, error: "Unsupported action" });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── AUDIT LOG ENDPOINTS ─────────────── */
router.get("/condition-rules/audit", async (req, res) => {
  try {
    const { ruleId, action, page = "1", limit = "50" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = sql`1=1`;
    if (ruleId) whereClause = sql`${whereClause} AND rule_id = ${ruleId}`;
    if (action) whereClause = sql`${whereClause} AND action = ${action}`;

    const entries = await db.execute(sql`
      SELECT * FROM condition_rule_audit_log
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);
    const [countRow] = await db.execute(sql`
      SELECT count(*)::int AS total FROM condition_rule_audit_log WHERE ${whereClause}
    `);

    res.json({
      success: true,
      data: {
        entries: entries.rows,
        total: (countRow as any)?.rows?.[0]?.total ?? entries.rows.length,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.get("/condition-rules/:id/audit", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = "1", limit = "50" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const entries = await db.execute(sql`
      SELECT * FROM condition_rule_audit_log
      WHERE rule_id = ${id}
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);

    res.json({ success: true, data: { entries: entries.rows } });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── SIMULATE ENDPOINT ─────────────── */
router.get("/condition-rules/:id/simulate", async (req, res) => {
  try {
    const { id } = req.params;
    const [rule] = await db.select().from(conditionRulesTable).where(eq(conditionRulesTable.id, id)).limit(1);
    if (!rule) return res.status(404).json({ success: false, error: "Rule not found" });

    const roleFilter = rule.targetRole === "van_driver" ? "rider" : rule.targetRole;

    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, roles: usersTable.roles })
      .from(usersTable)
      .where(ilike(usersTable.roles, `%${roleFilter}%`))
      .limit(500);

    const matches: Array<{ userId: string; userName: string; metricValue: number }> = [];
    let totalChecked = 0;

    for (const u of users) {
      try {
        const value = await computeUserMetric(u.id, rule.metric);
        if (value == null) continue;
        totalChecked++;
        if (compareMetric(value, rule.operator, rule.threshold)) {
          matches.push({ userId: u.id, userName: u.name || u.id, metricValue: value });
        }
      } catch {
        // skip user on error
      }
    }

    res.json({
      success: true,
      data: {
        matchCount: matches.length,
        totalChecked,
        matches,
        rule: { id: rule.id, name: rule.name, metric: rule.metric, operator: rule.operator, threshold: rule.threshold },
      },
    });
  } catch (error) {
    console.error("[admin/condition-rules] simulate error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── DEFAULT RULE SEEDS ─────────────── */
const DEFAULT_RULES: Array<Partial<typeof conditionRulesTable.$inferInsert>> = [
  // Customer
  { name: "Customer high cancellation", targetRole: "customer", metric: "cancellation_rate", operator: ">", threshold: "30", conditionType: "warning_l2", severity: "warning", cooldownHours: 48, description: "Cancels too many orders in 30 days" },
  { name: "Customer low order completion", targetRole: "customer", metric: "order_completion_rate", operator: "<", threshold: "60", conditionType: "warning_l1", severity: "warning", cooldownHours: 48, description: "Order completion rate below 60%" },
  { name: "Customer fraud incident", targetRole: "customer", metric: "fraud_incidents", operator: ">=", threshold: "1", conditionType: "ban_fraud", severity: "ban", cooldownHours: 0, description: "Confirmed payment fraud" },
  { name: "Customer abuse reports", targetRole: "customer", metric: "abuse_reports", operator: ">=", threshold: "3", conditionType: "suspension_temporary", severity: "suspension", cooldownHours: 72, description: "Multiple abuse reports filed" },
  { name: "Customer failed payments", targetRole: "customer", metric: "failed_payments_7d", operator: ">=", threshold: "5", conditionType: "restriction_cash_only", severity: "restriction_normal", cooldownHours: 168, description: "Repeated failed payment attempts" },
  { name: "Customer complaint reports", targetRole: "customer", metric: "complaint_reports", operator: ">=", threshold: "5", conditionType: "warning_l2", severity: "warning", cooldownHours: 72, description: "Multiple complaint reports against customer" },
  // Rider
  { name: "Rider high cancellation", targetRole: "rider", metric: "cancellation_rate", operator: ">", threshold: "25", conditionType: "warning_l1", severity: "warning", cooldownHours: 48, description: "Rider cancels too many assigned orders" },
  { name: "Rider miss/ignore high", targetRole: "rider", metric: "miss_ignore_rate", operator: ">", threshold: "40", conditionType: "warning_l2", severity: "warning", cooldownHours: 48, description: "Rider ignores or misses assigned orders" },
  { name: "Rider rating low", targetRole: "rider", metric: "avg_rating_30d", operator: "<", threshold: "3.5", conditionType: "warning_l1", severity: "warning", cooldownHours: 72, description: "Average rating below 3.5 in 30 days" },
  { name: "Rider GPS spoofing", targetRole: "rider", metric: "gps_spoofing", operator: ">=", threshold: "1", conditionType: "ban_fraud", severity: "ban", cooldownHours: 0, description: "GPS location spoofing detected" },
  { name: "Rider cancellation debt", targetRole: "rider", metric: "cancellation_debt", operator: ">", threshold: "500", conditionType: "restriction_new_order_block", severity: "restriction_strict", cooldownHours: 24, description: "Cancellation fees owed exceed threshold" },
  { name: "Rider low completion rate", targetRole: "rider", metric: "order_completion_rate", operator: "<", threshold: "70", conditionType: "warning_l2", severity: "warning", cooldownHours: 48, description: "Order completion rate too low" },
  // Van driver (synthetic role)
  { name: "Van driver excessive cancellations", targetRole: "van_driver", metric: "van_cancellation_count_30d", operator: ">=", threshold: "5", conditionType: "warning_l2", severity: "warning", cooldownHours: 48, description: "Cancelled too many van trips in last 30 days" },
  { name: "Van driver no-shows", targetRole: "van_driver", metric: "van_noshow_count", operator: ">=", threshold: "3", conditionType: "restriction_service_block", severity: "restriction_normal", cooldownHours: 72, description: "Multiple passenger no-shows on van trips" },
  { name: "Van driver missed start", targetRole: "van_driver", metric: "van_driver_missed_start", operator: ">=", threshold: "2", conditionType: "warning_l1", severity: "warning", cooldownHours: 24, description: "Missed scheduled trip starts" },
  // Vendor
  { name: "Vendor complaint reports", targetRole: "vendor", metric: "complaint_reports", operator: ">=", threshold: "5", conditionType: "warning_l2", severity: "warning", cooldownHours: 72, description: "Multiple customer complaint reports" },
  { name: "Vendor fake item complaints", targetRole: "vendor", metric: "fake_item_complaints", operator: ">=", threshold: "3", conditionType: "restriction_new_order_block", severity: "restriction_strict", cooldownHours: 168, description: "Fake or wrong item complaints" },
  { name: "Vendor hygiene complaints", targetRole: "vendor", metric: "hygiene_complaints", operator: ">=", threshold: "3", conditionType: "suspension_temporary", severity: "suspension", cooldownHours: 168, description: "Hygiene or quality complaints" },
  { name: "Vendor late pattern violations", targetRole: "vendor", metric: "late_pattern_violations", operator: ">=", threshold: "5", conditionType: "warning_l1", severity: "warning", cooldownHours: 48, description: "Repeated late open/close violations" },
  { name: "Vendor low rating", targetRole: "vendor", metric: "avg_rating_30d", operator: "<", threshold: "3.0", conditionType: "warning_l2", severity: "warning", cooldownHours: 72, description: "Vendor average rating below 3.0 in 30 days" },
];

router.post("/condition-rules/seed-defaults", async (req, res) => {
  try {
    const changedBy = req.body?.changedBy || "admin";
    const existing = await db.select({ name: conditionRulesTable.name }).from(conditionRulesTable);
    const existingNames = new Set(existing.map((r) => r.name));

    const toInsert = DEFAULT_RULES.filter((r) => !existingNames.has(r.name!));
    if (toInsert.length === 0) {
      return res.json({ success: true, message: "All default rules already exist", inserted: 0 });
    }

    const rows = toInsert.map((r) => ({
      id: generateId(),
      name: r.name!,
      description: r.description ?? null,
      targetRole: r.targetRole!,
      metric: r.metric!,
      operator: r.operator!,
      threshold: String(r.threshold),
      conditionType: r.conditionType!,
      severity: r.severity!,
      cooldownHours: r.cooldownHours ?? 24,
      modeApplicability: "default,ai_recommended,custom",
      isActive: true,
    }));
    await db.insert(conditionRulesTable).values(rows as any);

    for (const row of rows) {
      await logRuleAudit("created", row, changedBy);
    }

    return res.json({ success: true, message: `Seeded ${rows.length} default rules`, inserted: rows.length });
  } catch (error) {
    console.error("[admin/condition-rules] seed error:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── METRIC COMPUTATION ─────────────── */
async function computeUserMetric(userId: string, metric: string): Promise<number | null> {
  const now = new Date();
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ago7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  switch (metric) {
    /* ── Van metrics (existing) ── */
    case "van_cancellation_count_30d": {
      const driverSchedules = await db.select({ id: vanSchedulesTable.id })
        .from(vanSchedulesTable).where(eq(vanSchedulesTable.driverId, userId));
      const ids = driverSchedules.map((s) => s.id);
      if (ids.length === 0) return 0;
      const [row] = await db.select({ c: sql<number>`count(*)::int` })
        .from(vanBookingsTable)
        .where(and(
          inArray(vanBookingsTable.scheduleId, ids),
          eq(vanBookingsTable.status, "cancelled"),
          gte(vanBookingsTable.cancelledAt, ago30),
        ));
      return Number(row?.c ?? 0);
    }
    case "van_noshow_count": {
      const today = now.toISOString().split("T")[0]!;
      const driverSchedules = await db.select({ id: vanSchedulesTable.id })
        .from(vanSchedulesTable).where(eq(vanSchedulesTable.driverId, userId));
      const ids = driverSchedules.map((s) => s.id);
      if (ids.length === 0) return 0;
      const [row] = await db.select({ c: sql<number>`count(*)::int` })
        .from(vanBookingsTable)
        .where(and(
          inArray(vanBookingsTable.scheduleId, ids),
          eq(vanBookingsTable.status, "confirmed"),
          gte(vanBookingsTable.createdAt, ago30),
          sql`${vanBookingsTable.travelDate} < ${today}`,
          sql`${vanBookingsTable.boardedAt} IS NULL`,
        ));
      return Number(row?.c ?? 0);
    }
    case "van_driver_missed_start": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` })
        .from(vanSchedulesTable)
        .where(and(
          eq(vanSchedulesTable.driverId, userId),
          eq(vanSchedulesTable.tripStatus, "idle"),
          gte(vanSchedulesTable.updatedAt, ago30),
        ));
      return Number(row?.c ?? 0);
    }

    /* ── Order-based metrics ── */
    case "cancellation_rate": {
      const whereClause = and(
        or(eq(ordersTable.userId, userId), eq(ordersTable.riderId, userId)),
        gte(ordersTable.createdAt, ago30),
      );
      const [total] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(whereClause);
      if (!total?.c || total.c === 0) return 0;
      const [cancelled] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(
        and(whereClause, eq(ordersTable.status, "cancelled")),
      );
      return Math.round(((cancelled?.c ?? 0) / total.c) * 100 * 10) / 10;
    }

    case "order_completion_rate": {
      const whereClause = and(
        or(
          eq(ordersTable.userId, userId),
          eq(ordersTable.riderId, userId),
          eq(ordersTable.vendorId, userId),
        ),
        gte(ordersTable.createdAt, ago30),
      );
      const [total] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(whereClause);
      if (!total?.c || total.c === 0) return 0;
      const [delivered] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(
        and(whereClause, eq(ordersTable.status, "delivered")),
      );
      return Math.round(((delivered?.c ?? 0) / total.c) * 100 * 10) / 10;
    }

    case "miss_ignore_rate": {
      const [total] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(
        and(eq(ordersTable.assignedRiderId, userId), gte(ordersTable.createdAt, ago30)),
      );
      if (!total?.c || total.c === 0) return 0;
      const [missed] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(
        and(
          eq(ordersTable.assignedRiderId, userId),
          gte(ordersTable.createdAt, ago30),
          eq(ordersTable.status, "cancelled"),
          sql`${ordersTable.riderId} IS NULL`,
        ),
      );
      return Math.round(((missed?.c ?? 0) / total.c) * 100 * 10) / 10;
    }

    case "failed_payments_7d": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(
        and(
          eq(ordersTable.userId, userId),
          gte(ordersTable.createdAt, ago7),
          eq(ordersTable.paymentStatus, "failed"),
        ),
      );
      return Number(row?.c ?? 0);
    }

    case "cancellation_debt": {
      const [row] = await db.select({ s: sql<number>`coalesce(sum(amount::numeric), 0)` }).from(walletTransactionsTable).where(
        and(
          eq(walletTransactionsTable.userId, userId),
          ilike(walletTransactionsTable.type, "%cancellation%"),
        ),
      );
      return Number(row?.s ?? 0);
    }

    /* ── Rating metrics ── */
    case "avg_rating_30d": {
      const [riderRating] = await db.select({ avg: sql<number>`coalesce(avg(rider_rating::numeric), 0)` }).from(reviewsTable).where(
        and(eq(reviewsTable.riderId, userId), gte(reviewsTable.createdAt, ago30), sql`${reviewsTable.riderRating} IS NOT NULL`),
      );
      if (riderRating?.avg && Number(riderRating.avg) > 0) return Math.round(Number(riderRating.avg) * 100) / 100;

      const [vendorRating] = await db.select({ avg: sql<number>`coalesce(avg(rating::numeric), 0)` }).from(reviewsTable).where(
        and(eq(reviewsTable.vendorId, userId), gte(reviewsTable.createdAt, ago30)),
      );
      if (vendorRating?.avg && Number(vendorRating.avg) > 0) return Math.round(Number(vendorRating.avg) * 100) / 100;

      const [customerRating] = await db.select({ avg: sql<number>`coalesce(avg(rating::numeric), 0)` }).from(reviewsTable).where(
        and(eq(reviewsTable.userId, userId), gte(reviewsTable.createdAt, ago30)),
      );
      return Math.round(Number(customerRating?.avg ?? 0) * 100) / 100;
    }

    /* ── Location-based metrics ── */
    case "gps_spoofing": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(locationLogsTable).where(
        and(eq(locationLogsTable.userId, userId), eq(locationLogsTable.isSpoofed, true)),
      );
      return Number(row?.c ?? 0);
    }

    /* ── Report-based metrics ── */
    case "abuse_reports": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(chatReportsTable).where(
        eq(chatReportsTable.reportedUserId, userId),
      );
      return Number(row?.c ?? 0);
    }

    case "fraud_incidents": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(chatReportsTable).where(
        and(
          eq(chatReportsTable.reportedUserId, userId),
          or(ilike(chatReportsTable.reason, "%fraud%"), ilike(chatReportsTable.reason, "%chargeback%")),
        ),
      );
      return Number(row?.c ?? 0);
    }

    case "complaint_reports": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(chatReportsTable).where(
        and(eq(chatReportsTable.reportedUserId, userId), gte(chatReportsTable.createdAt, ago30)),
      );
      return Number(row?.c ?? 0);
    }

    case "fake_item_complaints": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(chatReportsTable).where(
        and(
          eq(chatReportsTable.reportedUserId, userId),
          or(ilike(chatReportsTable.reason, "%fake%"), ilike(chatReportsTable.reason, "%wrong item%"), ilike(chatReportsTable.reason, "%wrong_item%")),
        ),
      );
      return Number(row?.c ?? 0);
    }

    case "hygiene_complaints": {
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(chatReportsTable).where(
        and(
          eq(chatReportsTable.reportedUserId, userId),
          or(ilike(chatReportsTable.reason, "%hygiene%"), ilike(chatReportsTable.reason, "%quality%")),
        ),
      );
      return Number(row?.c ?? 0);
    }

    case "late_pattern_violations": {
      // No dedicated late-event table exists; proxy via orders that timed out or were vendor-cancelled
      console.warn(`[computeUserMetric] late_pattern_violations: no dedicated table, using cancelled vendor orders as proxy`);
      const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(ordersTable).where(
        and(
          eq(ordersTable.vendorId, userId),
          eq(ordersTable.status, "cancelled"),
          gte(ordersTable.createdAt, ago30),
        ),
      );
      return Number(row?.c ?? 0);
    }

    default:
      return null;
  }
}

function compareMetric(value: number, operator: string, threshold: string): boolean {
  const t = parseFloat(threshold);
  if (Number.isNaN(t)) return false;
  switch (operator) {
    case ">": return value > t;
    case "<": return value < t;
    case ">=": return value >= t;
    case "<=": return value <= t;
    case "==": return value === t;
    case "!=": return value !== t;
    default: return false;
  }
}

/**
 * Evaluate all active rules whose targetRole matches any role of the user.
 * Honors per-rule cooldown and inserts new conditions when thresholds are met.
 * Exported so other routes (e.g. van mode entry) can trigger evaluation.
 */
export async function evaluateRulesForUser(userId: string) {
  const roleSet = await getUserRoleSet(userId);
  const primaryRole = await getUserRole(userId);
  const roleArr = Array.from(roleSet);

  const rules = await db
    .select()
    .from(conditionRulesTable)
    .where(and(
      eq(conditionRulesTable.isActive, true),
      inArray(conditionRulesTable.targetRole, roleArr),
    ));

  const triggered: Array<{ ruleId: string; ruleName: string; metric: string; value: number; conditionId?: string }> = [];
  const skipped: Array<{ ruleId: string; ruleName: string; reason: string }> = [];

  for (const rule of rules) {
    const value = await computeUserMetric(userId, rule.metric);
    if (value == null) {
      skipped.push({ ruleId: rule.id, ruleName: rule.name, reason: "metric_not_implemented" });
      continue;
    }
    if (!compareMetric(value, rule.operator, rule.threshold)) continue;

    if (rule.cooldownHours > 0) {
      const cutoff = new Date(Date.now() - rule.cooldownHours * 60 * 60 * 1000);
      const [recent] = await db
        .select({ id: accountConditionsTable.id })
        .from(accountConditionsTable)
        .where(and(
          eq(accountConditionsTable.userId, userId),
          eq(accountConditionsTable.conditionType, rule.conditionType),
          gte(accountConditionsTable.appliedAt, cutoff),
        ))
        .limit(1);
      if (recent) {
        skipped.push({ ruleId: rule.id, ruleName: rule.name, reason: "cooldown" });
        continue;
      }
    }
    const [created] = await db
      .insert(accountConditionsTable)
      .values({
        id: generateId(),
        userId,
        userRole: rule.targetRole === "van_driver" ? "van_driver" : primaryRole,
        conditionType: rule.conditionType,
        severity: rule.severity,
        category: SEVERITY_TO_CATEGORY[rule.severity] || "warning",
        reason: `Auto: ${rule.name} (${rule.metric} ${rule.operator} ${rule.threshold}, observed ${value})`,
        appliedBy: "rule_engine",
        isActive: true,
        metadata: { ruleId: rule.id, metric: rule.metric, observed: value, threshold: rule.threshold },
      })
      .returning();

    await logRuleAudit("fired", rule, "rule_engine", { userId, metric: rule.metric, observed: value, conditionId: created?.id });
    triggered.push({ ruleId: rule.id, ruleName: rule.name, metric: rule.metric, value, conditionId: created?.id });
  }

  return {
    userId,
    primaryRole,
    roles: roleArr,
    evaluated: rules.length,
    triggered: triggered.length,
    skipped: skipped.length,
    details: { triggered, skipped },
  };
}

router.post("/condition-rules/evaluate/:userId", async (req, res) => {
  try {
    const result = await evaluateRulesForUser(req.params.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[admin/condition-rules] evaluate error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/* ─────────────── CONDITION SETTINGS ─────────────── */
router.get("/condition-settings", async (_req, res) => {
  try {
    const [settings] = await db.select().from(conditionSettingsTable).limit(1);
    if (!settings) {
      const [created] = await db
        .insert(conditionSettingsTable)
        .values({ id: generateId(), mode: "default" })
        .returning();
      return res.json({ success: true, data: created });
    }
    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
});

router.patch("/condition-settings", async (req, res) => {
  try {
    const { mode, customThresholds, aiParameters, updatedBy } = req.body ?? {};
    const [existing] = await db.select().from(conditionSettingsTable).limit(1);
    if (!existing) {
      const [created] = await db
        .insert(conditionSettingsTable)
        .values({
          id: generateId(),
          mode: mode ?? "default",
          customThresholds: customThresholds ?? null,
          aiParameters: aiParameters ?? null,
          updatedBy: updatedBy ?? "admin",
        })
        .returning();
      return res.json({ success: true, data: created });
    }
    const updates: any = { updatedAt: new Date() };
    if (mode !== undefined) updates.mode = mode;
    if (customThresholds !== undefined) updates.customThresholds = customThresholds;
    if (aiParameters !== undefined) updates.aiParameters = aiParameters;
    if (updatedBy !== undefined) updates.updatedBy = updatedBy;
    const [updated] = await db
      .update(conditionSettingsTable)
      .set(updates)
      .where(eq(conditionSettingsTable.id, existing.id))
      .returning();
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
