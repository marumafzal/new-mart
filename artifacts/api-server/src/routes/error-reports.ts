import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { errorReportsTable, customerErrorReportsTable, errorResolutionBackupsTable, autoResolveLogTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, count, inArray, ne, sql, lt, type SQL } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { sendSuccess, sendError, sendNotFound, sendValidationError } from "../lib/response.js";
import { adminAuth, type AdminRequest } from "./admin-shared.js";
import { validateBody } from "../middleware/validate.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Public ingest abuse controls ────────────────────────────────────────────
   The public POST `/api/error-reports` endpoint accepts unauthenticated
   reports from every client app, which is also a tempting target for a
   self-amplifying log-flood DoS. We protect it with two cheap, complementary
   guards:

   1. HMAC-SHA256 signature over the raw request body, keyed by a server-side
      secret that is also injected into client builds at build time. A missing
      or wrong signature returns 401 BEFORE any DB work runs.
   2. A small in-memory token bucket per client IP (default 30 req/min). When
      the bucket is empty the request returns 429.

   In development the HMAC check is bypassed when no secret is configured so
   local work isn't blocked. In production we **fail-closed**: if
   `ERROR_REPORT_HMAC_SECRET` is missing or unsigned requests arrive, we
   reject with 401 rather than silently accepting them.
   ──────────────────────────────────────────────────────────────────────── */
const ERROR_REPORT_HMAC_HEADER = "x-report-signature";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getHmacSecret(): string | null {
  return (process.env.ERROR_REPORT_HMAC_SECRET ?? "").trim() || null;
}

/* Trust the IP that Express derived for us. `app.set('trust proxy', 1)` is
   enabled in app.ts so `req.ip` is the first hop in the X-Forwarded-For chain
   when behind the Replit proxy, and the socket address otherwise. We never
   parse the X-Forwarded-For header directly because attackers can spoof it
   to rotate identities and evade per-IP rate limits. */
function getClientIpFromReq(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/* ── In-memory token bucket per IP ──
   Map<ip, { tokens, lastRefillMs }>. Buckets are pruned lazily — entries are
   only deleted when an IP comes back; no global GC is needed because the map
   stays small as long as legitimate IPs keep refilling. */
type Bucket = { tokens: number; lastRefillMs: number };
const ipBuckets = new Map<string, Bucket>();

function getRateLimitConfig(): { capacity: number; refillPerMs: number } {
  const perMin = Math.max(1, parseInt(process.env.ERROR_REPORT_RATE_PER_MIN ?? "30", 10) || 30);
  return { capacity: perMin, refillPerMs: perMin / 60_000 };
}

function tryConsume(ip: string): boolean {
  const { capacity, refillPerMs } = getRateLimitConfig();
  const now = Date.now();
  const existing = ipBuckets.get(ip);
  if (!existing) {
    ipBuckets.set(ip, { tokens: capacity - 1, lastRefillMs: now });
    return true;
  }
  const elapsed = now - existing.lastRefillMs;
  const refilled = Math.min(capacity, existing.tokens + elapsed * refillPerMs);
  if (refilled < 1) {
    existing.tokens = refilled;
    existing.lastRefillMs = now;
    return false;
  }
  existing.tokens = refilled - 1;
  existing.lastRefillMs = now;
  return true;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/* Middleware: HMAC verify + rate limit. Order: rate-limit FIRST so a flood of
   unsigned requests is rejected without running the (cheap) HMAC compare. */
function errorReportIngestGuard(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIpFromReq(req);
  if (!tryConsume(ip)) {
    res.status(429).set("Retry-After", "60").json({
      success: false,
      error: "Too many error reports — please slow down",
    });
    return;
  }

  const secret = getHmacSecret();
  if (!secret) {
    /* No secret configured. In production this is a misconfiguration —
       fail-closed so the endpoint is never silently unauthenticated.
       In development we accept unsigned reports so local work isn't blocked. */
    if (isProduction()) {
      res.status(401).json({ success: false, error: "Error-report ingest not configured" });
      return;
    }
    next();
    return;
  }

  const provided = (req.headers[ERROR_REPORT_HMAC_HEADER] as string | undefined)?.trim() ?? "";
  if (!provided) {
    res.status(401).json({ success: false, error: "Missing error-report signature" });
    return;
  }

  /* Use raw body bytes captured by the express.json verify hook in app.ts.
     Falling back to the parsed JSON re-stringified is intentionally NOT done:
     any whitespace/key-order differences would silently break verification. */
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || raw.length === 0) {
    res.status(401).json({ success: false, error: "Missing request body" });
    return;
  }
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!timingSafeEqualHex(expected, provided.toLowerCase())) {
    res.status(401).json({ success: false, error: "Invalid error-report signature" });
    return;
  }
  next();
}

const VALID_SOURCE_APPS = ["customer", "rider", "vendor", "admin", "api"] as const;
const VALID_ERROR_TYPES = ["frontend_crash", "api_error", "db_error", "route_error", "ui_error", "unhandled_exception"] as const;
const VALID_SEVERITIES = ["critical", "medium", "minor"] as const;
const VALID_STATUSES = ["new", "acknowledged", "in_progress", "resolved"] as const;

type SourceApp = typeof VALID_SOURCE_APPS[number];
type ErrorType = typeof VALID_ERROR_TYPES[number];

function classifySeverity(errorType: ErrorType, statusCode?: number, errorMessage?: string): typeof VALID_SEVERITIES[number] {
  if (errorType === "db_error") return "critical";
  if (errorType === "unhandled_exception") return "medium";
  if (errorType === "ui_error") return "minor";
  if (errorType === "frontend_crash") return "critical";

  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("auth") || msg.includes("payment") || msg.includes("database")) return "critical";

  if (errorType === "api_error" || errorType === "route_error") {
    if (statusCode && statusCode >= 500) return "critical";
    if (statusCode === 422 || statusCode === 400) return "minor";
    if (statusCode && statusCode >= 400) return "medium";
  }

  return "medium";
}

function classifyImpact(errorType: ErrorType, severity: string): string {
  const impacts: Record<string, Record<string, string>> = {
    frontend_crash: { critical: "App crash — user cannot continue", medium: "Component failure — partial functionality loss", minor: "Minor rendering issue" },
    api_error:      { critical: "Server error — feature unavailable", medium: "Request rejected — user action blocked", minor: "Non-critical API issue" },
    db_error:       { critical: "Database failure — data operations blocked", medium: "Database query issue", minor: "Minor database issue" },
    route_error:    { critical: "Route handler failure — endpoint down", medium: "Route error — degraded service", minor: "Minor routing issue" },
    ui_error:       { critical: "UI completely broken", medium: "UI partially broken", minor: "Minor UI glitch" },
    unhandled_exception: { critical: "Unhandled crash — potential data loss", medium: "Unhandled error — unexpected behavior", minor: "Minor unhandled error" },
  };
  return impacts[errorType]?.[severity] || "Error detected — investigation needed";
}

const createErrorReportSchema = z.object({
  sourceApp:     z.enum(VALID_SOURCE_APPS),
  errorType:     z.enum(VALID_ERROR_TYPES),
  severity:      z.enum(VALID_SEVERITIES).optional().transform(() => undefined),
  functionName:  z.string().max(500).optional(),
  moduleName:    z.string().max(500).optional(),
  componentName: z.string().max(500).optional(),
  errorMessage:  z.string().max(5000),
  stackTrace:    z.string().max(50000).optional(),
  metadata:      z.record(z.unknown()).optional(),
  statusCode:    z.number().optional(),
  /** Client-computed DJB2 hash for deduplication */
  errorHash:     z.string().max(64).optional(),
});

/* ── Deterministic DJB2 fingerprint for grouping identical errors ──────── */
function computeErrorHash(errorMessage: string, errorType: string, sourceApp: string): string {
  const key = `${errorType}::${sourceApp}::${errorMessage.slice(0, 300)}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

router.post("/", errorReportIngestGuard, validateBody(createErrorReportSchema), async (req, res) => {
  try {
    const body = req.body;
    const severity = classifySeverity(body.errorType, body.statusCode, body.errorMessage);
    const shortImpact = classifyImpact(body.errorType, severity);

    /* ── Hash-based deduplication ──────────────────────────────────────── */
    const hash = body.errorHash ?? computeErrorHash(body.errorMessage, body.errorType, body.sourceApp);
    let existingByHash: (typeof errorReportsTable.$inferSelect) | undefined;
    try {
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
      const [row] = await db.select()
        .from(errorReportsTable)
        .where(and(
          eq(errorReportsTable.errorHash, hash),
          ne(errorReportsTable.status, "resolved"),
          gte(errorReportsTable.timestamp, cutoff),
        ))
        .limit(1);
      existingByHash = row;
    } catch {
      /* Columns may not exist yet on first startup — safe to skip dedup */
    }

    if (existingByHash) {
      const newCount = (existingByHash.occurrenceCount ?? 1) + 1;
      try {
        await db.update(errorReportsTable)
          .set({ occurrenceCount: newCount, updatedAt: new Date() })
          .where(eq(errorReportsTable.id, existingByHash.id));
      } catch {}
      return sendSuccess(res, {
        ...existingByHash,
        occurrenceCount: newCount,
        deduplicated: true,
        timestamp: existingByHash.timestamp.toISOString(),
        resolvedAt: existingByHash.resolvedAt?.toISOString() ?? null,
        acknowledgedAt: existingByHash.acknowledgedAt?.toISOString() ?? null,
        updatedAt: new Date().toISOString(),
      }, undefined, 200);
    }

    const id = generateId();
    const [report] = await db.insert(errorReportsTable).values({
      id,
      sourceApp: body.sourceApp,
      errorType: body.errorType,
      severity,
      functionName: body.functionName || null,
      moduleName: body.moduleName || null,
      componentName: body.componentName || null,
      errorMessage: body.errorMessage,
      shortImpact,
      stackTrace: body.stackTrace || null,
      metadata: body.metadata || null,
      errorHash: hash,
      occurrenceCount: 1,
    }).returning();

    sendSuccess(res, report, undefined, 201);
  } catch (err) {
    logger.error({ err }, "Failed to store error report");
    sendError(res, "Failed to store error report", 500);
  }
});

router.get("/", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"))));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    const sourceApp = req.query["sourceApp"] as string | undefined;
    if (sourceApp && (VALID_SOURCE_APPS as readonly string[]).includes(sourceApp)) {
      conditions.push(eq(errorReportsTable.sourceApp, sourceApp as SourceApp));
    }

    const severity = req.query["severity"] as string | undefined;
    if (severity && (VALID_SEVERITIES as readonly string[]).includes(severity)) {
      conditions.push(eq(errorReportsTable.severity, severity as typeof VALID_SEVERITIES[number]));
    }

    const statusParam = req.query["status"];
    const statusValues = (Array.isArray(statusParam) ? statusParam : statusParam ? [statusParam] : []) as string[];
    const validStatusValues = statusValues.filter(s => (VALID_STATUSES as readonly string[]).includes(s)) as typeof VALID_STATUSES[number][];
    if (validStatusValues.length === 1) {
      conditions.push(eq(errorReportsTable.status, validStatusValues[0]!));
    } else if (validStatusValues.length > 1) {
      conditions.push(inArray(errorReportsTable.status, validStatusValues));
    }

    const errorType = req.query["errorType"] as string | undefined;
    if (errorType && (VALID_ERROR_TYPES as readonly string[]).includes(errorType)) {
      conditions.push(eq(errorReportsTable.errorType, errorType as ErrorType));
    }

    const dateFrom = req.query["dateFrom"] as string;
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) conditions.push(gte(errorReportsTable.timestamp, d));
    }

    const dateTo = req.query["dateTo"] as string;
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) conditions.push(lte(errorReportsTable.timestamp, d));
    }

    const resolutionMethod = req.query["resolutionMethod"] as string | undefined;
    if (resolutionMethod && ["manual", "auto_resolved", "task_created"].includes(resolutionMethod)) {
      conditions.push(eq(errorReportsTable.resolutionMethod, resolutionMethod as "manual" | "auto_resolved" | "task_created"));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [reports, [totalRow]] = await Promise.all([
      db.select().from(errorReportsTable)
        .where(where)
        .orderBy(desc(errorReportsTable.timestamp))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(errorReportsTable).where(where),
    ]);

    const total = totalRow?.count ?? 0;

    const reportIds = reports.map(r => r.id);
    let backupSet = new Set<string>();
    if (reportIds.length > 0) {
      const backups = await db.select({ errorReportId: errorResolutionBackupsTable.errorReportId })
        .from(errorResolutionBackupsTable)
        .where(and(
          inArray(errorResolutionBackupsTable.errorReportId, reportIds),
          gte(errorResolutionBackupsTable.expiresAt, new Date()),
        ));
      backupSet = new Set(backups.map(b => b.errorReportId));
    }

    sendSuccess(res, {
      reports: reports.map(r => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() || null,
        acknowledgedAt: r.acknowledgedAt?.toISOString() || null,
        updatedAt: r.updatedAt?.toISOString() || null,
        hasBackup: backupSet.has(r.id),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch error reports");
    sendError(res, "Failed to fetch error reports", 500);
  }
});

router.get("/new-count", adminAuth, async (_req, res) => {
  try {
    const [row] = await db.select({ count: count() })
      .from(errorReportsTable)
      .where(eq(errorReportsTable.status, "new"));
    sendSuccess(res, { count: row?.count ?? 0 });
  } catch (err) {
    logger.error({ err }, "Failed to fetch new error count");
    sendError(res, "Failed to fetch new error count", 500);
  }
});

router.post("/bulk-resolve", adminAuth, async (req, res) => {
  try {
    const { sourceApp, severity, errorType, statusFilter } = req.body as {
      sourceApp?: string;
      severity?: string;
      errorType?: string;
      statusFilter?: string[];
    };

    const conditions: SQL[] = [];

    if (sourceApp && (VALID_SOURCE_APPS as readonly string[]).includes(sourceApp)) {
      conditions.push(eq(errorReportsTable.sourceApp, sourceApp as SourceApp));
    }
    if (severity && (VALID_SEVERITIES as readonly string[]).includes(severity)) {
      conditions.push(eq(errorReportsTable.severity, severity as typeof VALID_SEVERITIES[number]));
    }
    if (errorType && (VALID_ERROR_TYPES as readonly string[]).includes(errorType)) {
      conditions.push(eq(errorReportsTable.errorType, errorType as ErrorType));
    }

    if (statusFilter && statusFilter.length > 0) {
      const validStatuses = statusFilter.filter(s => (VALID_STATUSES as readonly string[]).includes(s));
      if (validStatuses.length > 0) {
        conditions.push(inArray(errorReportsTable.status, validStatuses as typeof VALID_STATUSES[number][]));
      }
    } else {
      conditions.push(ne(errorReportsTable.status, "resolved"));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const toResolve = await db.select().from(errorReportsTable)
      .where(where)
      .limit(200);

    const now = new Date();
    for (const report of toResolve) {
      const backupId = generateId();
      await db.insert(errorResolutionBackupsTable).values({
        id: backupId,
        errorReportId: report.id,
        previousStatus: report.status,
        previousData: {
          status: report.status,
          resolvedAt: report.resolvedAt?.toISOString() || null,
          acknowledgedAt: report.acknowledgedAt?.toISOString() || null,
          resolutionMethod: report.resolutionMethod || null,
          resolutionNotes: report.resolutionNotes || null,
          rootCause: report.rootCause || null,
        },
        resolutionMethod: "manual",
        expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
      });
    }

    const resolveIds = toResolve.map(r => r.id);
    if (resolveIds.length > 0) {
      await db.update(errorReportsTable)
        .set({ status: "resolved", resolvedAt: now, resolutionMethod: "manual", updatedAt: now })
        .where(inArray(errorReportsTable.id, resolveIds));
    }

    sendSuccess(res, { resolvedCount: resolveIds.length });
  } catch (err) {
    logger.error({ err }, "Failed to bulk resolve error reports");
    sendError(res, "Failed to bulk resolve error reports", 500);
  }
});

router.post("/scan", adminAuth, async (req, res) => {
  try {
    const startedAt = new Date();
    const findings: Array<{ type: string; severity: string; message: string; detail: string }> = [];

    const oneHourAgo = new Date(Date.now() - 3600000);
    const oneDayAgo  = new Date(Date.now() - 86400000);

    const [
      [dbCheck],
      criticalLastHour,
      unresolvedCritical,
      errorsByType,
      [totalUnresolved],
    ] = await Promise.all([
      db.select({ now: sql<string>`now()` }).from(errorReportsTable).limit(1),
      db.select({ count: count() }).from(errorReportsTable).where(
        and(eq(errorReportsTable.severity, "critical"), gte(errorReportsTable.timestamp, oneHourAgo))
      ),
      db.select({ count: count() }).from(errorReportsTable).where(
        and(eq(errorReportsTable.severity, "critical"), ne(errorReportsTable.status, "resolved"))
      ),
      db.select({ errorType: errorReportsTable.errorType, count: count() })
        .from(errorReportsTable)
        .where(gte(errorReportsTable.timestamp, oneDayAgo))
        .groupBy(errorReportsTable.errorType)
        .orderBy(desc(count())),
      db.select({ count: count() }).from(errorReportsTable).where(
        ne(errorReportsTable.status, "resolved")
      ),
    ]);

    const dbOk = !!dbCheck;
    if (!dbOk) {
      findings.push({
        type: "db_health",
        severity: "critical",
        message: "Database connectivity failure",
        detail: "Unable to reach the database. All data operations are at risk.",
      });
    } else {
      findings.push({
        type: "db_health",
        severity: "ok",
        message: "Database is healthy",
        detail: "Connection confirmed and responding normally.",
      });
    }

    const criticalCount = criticalLastHour[0]?.count ?? 0;
    if (criticalCount >= 10) {
      findings.push({
        type: "critical_spike",
        severity: "critical",
        message: `Critical error spike: ${criticalCount} critical errors in the last hour`,
        detail: "High volume of critical errors detected. Immediate investigation recommended.",
      });
    } else if (criticalCount >= 3) {
      findings.push({
        type: "critical_spike",
        severity: "medium",
        message: `Elevated critical errors: ${criticalCount} in the last hour`,
        detail: "Multiple critical errors detected in a short window. Monitor closely.",
      });
    }

    const unresolvedCrit = unresolvedCritical[0]?.count ?? 0;
    if (unresolvedCrit > 0) {
      findings.push({
        type: "unresolved_critical",
        severity: "critical",
        message: `${unresolvedCrit} unresolved critical error${unresolvedCrit > 1 ? "s" : ""}`,
        detail: "Critical errors that have not been resolved. Users may currently be affected.",
      });
    }

    for (const row of errorsByType) {
      const cnt = row.count ?? 0;
      if (cnt >= 20) {
        findings.push({
          type: "error_type_spike",
          severity: "medium",
          message: `High ${row.errorType.replace(/_/g, " ")} frequency: ${cnt} in 24h`,
          detail: `This error type is occurring frequently. Consider a systemic fix.`,
        });
      }
    }

    const totalUnres = totalUnresolved?.count ?? 0;
    if (totalUnres >= 50) {
      findings.push({
        type: "backlog_alert",
        severity: "medium",
        message: `Error backlog: ${totalUnres} unresolved errors`,
        detail: "Large number of unresolved errors accumulating. Review and triage recommended.",
      });
    }

    const customerReportCount = await db.select({ count: count() })
      .from(customerErrorReportsTable)
      .where(eq(customerErrorReportsTable.status, "new"));

    const custCount = customerReportCount[0]?.count ?? 0;
    if (custCount > 0) {
      findings.push({
        type: "customer_reports",
        severity: custCount >= 5 ? "medium" : "minor",
        message: `${custCount} unreviewed customer report${custCount > 1 ? "s" : ""}`,
        detail: "Customers have submitted bug reports awaiting admin review.",
      });
    }

    const durationMs = Date.now() - startedAt.getTime();
    const overallSeverity = findings.some(f => f.severity === "critical")
      ? "critical"
      : findings.some(f => f.severity === "medium")
      ? "medium"
      : "ok";

    sendSuccess(res, {
      scannedAt: startedAt.toISOString(),
      durationMs,
      overallSeverity,
      totalUnresolved: totalUnres,
      criticalLastHour: criticalCount,
      unresolvedCritical: unresolvedCrit,
      customerReportsPending: custCount,
      findings,
    });
  } catch (err) {
    logger.error({ err }, "Scan failed");
    sendError(res, "Scan failed", 500);
  }
});

const STATUS_TRANSITIONS: Record<string, string> = {
  new: "acknowledged",
  acknowledged: "in_progress",
  in_progress: "resolved",
};

const updateStatusSchema = z.object({
  status: z.enum(VALID_STATUSES),
});

router.patch("/:id", adminAuth, validateBody(updateStatusSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    const [existing] = await db.select()
      .from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Error report not found");
      return;
    }

    const allowedNext = STATUS_TRANSITIONS[existing.status];
    if (newStatus !== allowedNext) {
      sendError(
        res,
        `Invalid transition: cannot move from '${existing.status}' to '${newStatus}'. Expected next step: '${allowedNext ?? "none (already resolved)"}'.`,
        400,
      );
      return;
    }

    const now = new Date();
    const updates: Record<string, unknown> = { status: newStatus, updatedAt: now };
    if (newStatus === "acknowledged") {
      updates.acknowledgedAt = now;
    } else if (newStatus === "resolved") {
      updates.resolvedAt = now;
      updates.resolutionMethod = "manual";

      const backupId = generateId();
      await db.insert(errorResolutionBackupsTable).values({
        id: backupId,
        errorReportId: id!,
        previousStatus: existing.status,
        previousData: {
          status: existing.status,
          resolvedAt: existing.resolvedAt?.toISOString() || null,
          acknowledgedAt: existing.acknowledgedAt?.toISOString() || null,
          resolutionMethod: existing.resolutionMethod || null,
          resolutionNotes: existing.resolutionNotes || null,
          rootCause: existing.rootCause || null,
        },
        resolutionMethod: "manual",
        expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
      });
    }

    const [updated] = await db.update(errorReportsTable)
      .set(updates)
      .where(eq(errorReportsTable.id, id!))
      .returning();

    if (!updated) {
      sendNotFound(res, "Error report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp: updated.timestamp.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
      updatedAt: updated.updatedAt?.toISOString() || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to update error report");
    sendError(res, "Failed to update error report", 500);
  }
});

const customerReportSchema = z.object({
  customerName:  z.string().min(1).max(200),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().max(30).optional(),
  userId:        z.string().optional(),
  appVersion:    z.string().max(50).optional(),
  deviceInfo:    z.string().max(500).optional(),
  platform:      z.enum(["ios", "android", "web"]).optional(),
  screen:        z.string().max(200).optional(),
  description:   z.string().min(5).max(5000),
  reproSteps:    z.string().max(5000).optional(),
});

router.post("/customer-report", validateBody(customerReportSchema), async (req, res) => {
  try {
    const body = req.body;
    const id = generateId();
    const [report] = await db.insert(customerErrorReportsTable).values({
      id,
      customerName:  body.customerName,
      customerEmail: body.customerEmail || null,
      customerPhone: body.customerPhone || null,
      userId:        body.userId || null,
      appVersion:    body.appVersion || null,
      deviceInfo:    body.deviceInfo || null,
      platform:      body.platform || null,
      screen:        body.screen || null,
      description:   body.description,
      reproSteps:    body.reproSteps || null,
    }).returning();

    sendSuccess(res, { id: report.id, message: "Report submitted successfully" }, undefined, 201);
  } catch (err) {
    logger.error({ err }, "Failed to submit customer report");
    sendError(res, "Failed to submit customer error report", 500);
  }
});

router.get("/customer-reports", adminAuth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query["page"] || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "30"))));
    const offset = (page - 1) * limit;

    const statusParam = req.query["status"] as string | undefined;
    const conditions: SQL[] = [];
    if (statusParam && ["new", "reviewed", "closed"].includes(statusParam)) {
      conditions.push(eq(customerErrorReportsTable.status, statusParam as "new" | "reviewed" | "closed"));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [reports, [totalRow]] = await Promise.all([
      db.select().from(customerErrorReportsTable)
        .where(where)
        .orderBy(desc(customerErrorReportsTable.timestamp))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(customerErrorReportsTable).where(where),
    ]);

    const total = totalRow?.count ?? 0;
    sendSuccess(res, {
      reports: reports.map(r => ({
        ...r,
        timestamp:  r.timestamp.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() || null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch customer reports");
    sendError(res, "Failed to fetch customer reports", 500);
  }
});

const updateCustomerReportSchema = z.object({
  status:    z.enum(["new", "reviewed", "closed"]).optional(),
  adminNote: z.string().max(2000).optional(),
});

router.patch("/customer-reports/:id", adminAuth, validateBody(updateCustomerReportSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const updates: Record<string, unknown> = {};
    if (body.status) {
      updates.status = body.status;
      if (body.status === "reviewed" || body.status === "closed") {
        updates.reviewedAt = new Date();
      }
    }
    if (body.adminNote !== undefined) {
      updates.adminNote = body.adminNote;
    }

    if (Object.keys(updates).length === 0) {
      sendValidationError(res, "No fields to update");
      return;
    }

    const [updated] = await db.update(customerErrorReportsTable)
      .set(updates)
      .where(eq(customerErrorReportsTable.id, id!))
      .returning();

    if (!updated) {
      sendNotFound(res, "Customer report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp:  updated.timestamp.toISOString(),
      reviewedAt: updated.reviewedAt?.toISOString() || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to update customer report");
    sendError(res, "Failed to update customer report", 500);
  }
});

const BACKUP_TTL_MS = 72 * 60 * 60 * 1000;

let _onSettingsChanged: (() => void) | null = null;
export function setOnAutoResolveSettingsChanged(cb: () => void) {
  _onSettingsChanged = cb;
}

const resolveSchema = z.object({
  method: z.enum(["manual", "auto_resolved", "task_created"]),
  resolutionNotes: z.string().max(5000).optional(),
  rootCause: z.string().max(2000).optional(),
});

router.post("/:id/resolve", adminAuth, validateBody(resolveSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { method, resolutionNotes, rootCause } = req.body;

    const [existing] = await db.select().from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Error report not found");
      return;
    }

    if (existing.status === "resolved") {
      sendError(res, "Error is already resolved", 400);
      return;
    }

    const backupId = generateId();
    await db.insert(errorResolutionBackupsTable).values({
      id: backupId,
      errorReportId: id!,
      previousStatus: existing.status,
      previousData: {
        status: existing.status,
        resolvedAt: existing.resolvedAt?.toISOString() || null,
        acknowledgedAt: existing.acknowledgedAt?.toISOString() || null,
        resolutionMethod: existing.resolutionMethod || null,
        resolutionNotes: existing.resolutionNotes || null,
        rootCause: existing.rootCause || null,
      },
      resolutionMethod: method,
      expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
    });

    const now = new Date();
    const [updated] = await db.update(errorReportsTable)
      .set({
        status: "resolved",
        resolvedAt: now,
        resolutionMethod: method,
        resolutionNotes: resolutionNotes || null,
        rootCause: rootCause || null,
        updatedAt: now,
      })
      .where(eq(errorReportsTable.id, id!))
      .returning();

    if (!updated) {
      sendNotFound(res, "Error report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp: updated.timestamp.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
      updatedAt: updated.updatedAt?.toISOString() || null,
      backupId,
    });
  } catch (err) {
    logger.error({ err }, "Failed to resolve error report");
    sendError(res, "Failed to resolve error report", 500);
  }
});

router.post("/:id/undo", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [backup] = await db.select().from(errorResolutionBackupsTable)
      .where(and(
        eq(errorResolutionBackupsTable.errorReportId, id!),
        gte(errorResolutionBackupsTable.expiresAt, new Date()),
      ))
      .orderBy(desc(errorResolutionBackupsTable.createdAt))
      .limit(1);

    if (!backup) {
      sendNotFound(res, "No backup found or backup has expired for this error report");
      return;
    }

    const prevData = backup.previousData as Record<string, unknown>;
    const now = new Date();

    const [updated] = await db.update(errorReportsTable)
      .set({
        status: (prevData.status as string) as "new" | "acknowledged" | "in_progress" | "resolved",
        resolvedAt: prevData.resolvedAt ? new Date(prevData.resolvedAt as string) : null,
        acknowledgedAt: prevData.acknowledgedAt ? new Date(prevData.acknowledgedAt as string) : null,
        resolutionMethod: (prevData.resolutionMethod as string | null) as "manual" | "auto_resolved" | "task_created" | null,
        resolutionNotes: (prevData.resolutionNotes as string | null) || null,
        rootCause: (prevData.rootCause as string | null) || null,
        updatedAt: now,
      })
      .where(eq(errorReportsTable.id, id!))
      .returning();

    await db.delete(errorResolutionBackupsTable)
      .where(eq(errorResolutionBackupsTable.id, backup.id));

    if (!updated) {
      sendNotFound(res, "Error report not found");
      return;
    }

    sendSuccess(res, {
      ...updated,
      timestamp: updated.timestamp.toISOString(),
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
      updatedAt: updated.updatedAt?.toISOString() || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to undo error resolution");
    sendError(res, "Failed to undo error resolution", 500);
  }
});

router.get("/:id/backup", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [backup] = await db.select().from(errorResolutionBackupsTable)
      .where(and(
        eq(errorResolutionBackupsTable.errorReportId, id!),
        gte(errorResolutionBackupsTable.expiresAt, new Date()),
      ))
      .orderBy(desc(errorResolutionBackupsTable.createdAt))
      .limit(1);

    sendSuccess(res, {
      hasBackup: !!backup,
      backup: backup ? {
        id: backup.id,
        previousStatus: backup.previousStatus,
        resolutionMethod: backup.resolutionMethod,
        createdAt: backup.createdAt.toISOString(),
        expiresAt: backup.expiresAt.toISOString(),
      } : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to check backup");
    sendError(res, "Failed to check backup", 500);
  }
});

router.delete("/backups/cleanup", adminAuth, async (_req, res) => {
  try {
    const now = new Date();
    const expired = await db.select({ id: errorResolutionBackupsTable.id, errorReportId: errorResolutionBackupsTable.errorReportId })
      .from(errorResolutionBackupsTable)
      .where(lt(errorResolutionBackupsTable.expiresAt, now));

    let deletedCount = 0;
    if (expired.length > 0) {
      const reportIds = [...new Set(expired.map(b => b.errorReportId))];
      const resolvedReports = await db.select({ id: errorReportsTable.id })
        .from(errorReportsTable)
        .where(and(
          inArray(errorReportsTable.id, reportIds),
          eq(errorReportsTable.status, "resolved"),
        ));
      const resolvedSet = new Set(resolvedReports.map(r => r.id));
      const toDelete = expired.filter(b => resolvedSet.has(b.errorReportId)).map(b => b.id);
      if (toDelete.length > 0) {
        await db.delete(errorResolutionBackupsTable)
          .where(inArray(errorResolutionBackupsTable.id, toDelete));
        deletedCount = toDelete.length;
      }
    }

    sendSuccess(res, { deletedCount });
  } catch (err) {
    logger.error({ err }, "Failed to cleanup backups");
    sendError(res, "Failed to cleanup backups", 500);
  }
});

export async function cleanupExpiredBackups() {
  try {
    const now = new Date();
    const expired = await db.select({ id: errorResolutionBackupsTable.id, errorReportId: errorResolutionBackupsTable.errorReportId })
      .from(errorResolutionBackupsTable)
      .where(lt(errorResolutionBackupsTable.expiresAt, now));

    if (expired.length === 0) return;

    const reportIds = [...new Set(expired.map(b => b.errorReportId))];
    const resolvedReports = await db.select({ id: errorReportsTable.id })
      .from(errorReportsTable)
      .where(and(
        inArray(errorReportsTable.id, reportIds),
        eq(errorReportsTable.status, "resolved"),
      ));
    const resolvedSet = new Set(resolvedReports.map(r => r.id));

    const toDelete = expired.filter(b => resolvedSet.has(b.errorReportId)).map(b => b.id);
    if (toDelete.length > 0) {
      await db.delete(errorResolutionBackupsTable)
        .where(inArray(errorResolutionBackupsTable.id, toDelete));
      logger.info({ count: toDelete.length }, "Cleaned up expired resolution backups for resolved errors");
    }
  } catch (err) {
    logger.error({ err }, "Failed to cleanup expired backups");
  }
}

const DEFAULT_AUTO_RESOLVE_SETTINGS = {
  enabled: false,
  severities: ["minor"],
  errorTypes: [] as string[],
  duplicateDetection: true,
  ageThresholdMinutes: 30,
  intervalMs: 300000,
};

export async function getAutoResolveSettings() {
  try {
    const [row] = await db.select().from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "auto_resolve_settings"));
    if (row) {
      return { ...DEFAULT_AUTO_RESOLVE_SETTINGS, ...JSON.parse(row.value) };
    }
  } catch {}
  return { ...DEFAULT_AUTO_RESOLVE_SETTINGS };
}

router.get("/auto-resolve-settings", adminAuth, async (_req, res) => {
  try {
    const settings = await getAutoResolveSettings();
    sendSuccess(res, settings);
  } catch (err) {
    logger.error({ err }, "Failed to get auto-resolve settings");
    sendError(res, "Failed to get auto-resolve settings", 500);
  }
});

const autoResolveSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  severities: z.array(z.string()).optional(),
  errorTypes: z.array(z.string()).optional(),
  duplicateDetection: z.boolean().optional(),
  ageThresholdMinutes: z.number().min(1).max(1440).optional(),
  intervalMs: z.number().min(30000).max(3600000).optional(),
});

router.put("/auto-resolve-settings", adminAuth, validateBody(autoResolveSettingsSchema), async (req, res) => {
  try {
    const current = await getAutoResolveSettings();
    const updated = { ...current, ...req.body };

    await db.insert(platformSettingsTable).values({
      key: "auto_resolve_settings",
      value: JSON.stringify(updated),
      label: "Auto-Resolve Engine Settings",
      category: "error_monitor",
    }).onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value: JSON.stringify(updated), updatedAt: new Date() },
    });

    if (_onSettingsChanged) _onSettingsChanged();
    sendSuccess(res, updated);
  } catch (err) {
    logger.error({ err }, "Failed to update auto-resolve settings");
    sendError(res, "Failed to update auto-resolve settings", 500);
  }
});

export async function runAutoResolve() {
  try {
    const settings = await getAutoResolveSettings();
    if (!settings.enabled) return { resolved: 0, logs: [] };

    const conditions: SQL[] = [ne(errorReportsTable.status, "resolved")];

    if (settings.severities.length > 0) {
      conditions.push(inArray(errorReportsTable.severity, settings.severities));
    }
    if (settings.errorTypes.length > 0) {
      conditions.push(inArray(errorReportsTable.errorType, settings.errorTypes));
    }
    if (settings.ageThresholdMinutes > 0) {
      const cutoff = new Date(Date.now() - settings.ageThresholdMinutes * 60 * 1000);
      conditions.push(lte(errorReportsTable.timestamp, cutoff));
    }

    const candidates = await db.select().from(errorReportsTable)
      .where(and(...conditions))
      .orderBy(desc(errorReportsTable.timestamp))
      .limit(50);

    let resolvedAlready: Set<string> = new Set();
    if (settings.duplicateDetection && candidates.length > 0) {
      const resolvedErrors = await db.select({
        errorMessage: errorReportsTable.errorMessage,
      }).from(errorReportsTable)
        .where(eq(errorReportsTable.status, "resolved"))
        .limit(500);
      resolvedAlready = new Set(resolvedErrors.map(r => r.errorMessage.toLowerCase().trim()));
    }

    const logs: Array<{ errorReportId: string; reason: string; ruleMatched: string }> = [];
    const now = new Date();

    for (const candidate of candidates) {
      let reason = "";
      let ruleMatched = "";

      if (settings.duplicateDetection && resolvedAlready.has(candidate.errorMessage.toLowerCase().trim())) {
        reason = `Duplicate of previously resolved error`;
        ruleMatched = "duplicate_detection";
      } else if (settings.severities.includes(candidate.severity)) {
        reason = `Severity "${candidate.severity}" matches auto-resolve filter`;
        ruleMatched = "severity_filter";
      } else if (settings.errorTypes.length > 0 && settings.errorTypes.includes(candidate.errorType)) {
        reason = `Error type "${candidate.errorType}" matches auto-resolve filter`;
        ruleMatched = "error_type_filter";
      } else {
        continue;
      }

      const backupId = generateId();
      await db.insert(errorResolutionBackupsTable).values({
        id: backupId,
        errorReportId: candidate.id,
        previousStatus: candidate.status,
        previousData: {
          status: candidate.status,
          resolvedAt: candidate.resolvedAt?.toISOString() || null,
          acknowledgedAt: candidate.acknowledgedAt?.toISOString() || null,
          resolutionMethod: candidate.resolutionMethod || null,
          resolutionNotes: candidate.resolutionNotes || null,
          rootCause: candidate.rootCause || null,
        },
        resolutionMethod: "auto_resolved",
        expiresAt: new Date(Date.now() + BACKUP_TTL_MS),
      });

      await db.update(errorReportsTable)
        .set({
          status: "resolved",
          resolvedAt: now,
          resolutionMethod: "auto_resolved",
          resolutionNotes: reason,
          updatedAt: now,
        })
        .where(eq(errorReportsTable.id, candidate.id));

      const logId = generateId();
      await db.insert(autoResolveLogTable).values({
        id: logId,
        errorReportId: candidate.id,
        reason,
        ruleMatched,
      });

      logs.push({ errorReportId: candidate.id, reason, ruleMatched });
    }

    if (logs.length > 0) {
      logger.info({ count: logs.length }, "Auto-resolve pass completed");
    }

    return { resolved: logs.length, logs };
  } catch (err) {
    logger.error({ err }, "Auto-resolve run failed");
    return { resolved: 0, logs: [], error: "Auto-resolve run failed" };
  }
}

router.post("/auto-resolve-run", adminAuth, async (_req, res) => {
  try {
    const result = await runAutoResolve();
    sendSuccess(res, result);
  } catch (err) {
    logger.error({ err }, "Failed to run auto-resolve");
    sendError(res, "Failed to run auto-resolve", 500);
  }
});

/* ── Gemini AI-powered error analysis (with rule-based fallback) ──────── */
router.post("/:id/ai-analyze", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [report] = await db.select().from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!report) { sendNotFound(res, "Error report not found"); return; }

    const baseUrl = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
    const apiKey  = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];

    /* ── Gemini primary ────────────────────────────────────────────────── */
    if (baseUrl && apiKey) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } });

        const prompt = `You are a senior software engineer analyzing a production error. Return valid JSON only — NO markdown, NO code fences.

Error Details:
- Type: ${report.errorType}
- Severity: ${report.severity}
- Source App: ${report.sourceApp}
- Error Message: ${report.errorMessage}
- Module: ${report.moduleName ?? "N/A"}
- Function: ${report.functionName ?? "N/A"}
- Stack Trace: ${(report.stackTrace ?? "N/A").slice(0, 2000)}

Return this JSON structure:
{
  "rootCause": "1-3 sentence root cause analysis",
  "fixSteps": ["Step 1", "Step 2", "Step 3"],
  "impactAssessment": "Impact if left unresolved",
  "confidence": 0.0,
  "autoResolvable": false,
  "preventionTips": ["Tip 1", "Tip 2"]
}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 1024, responseMimeType: "application/json" },
        });

        const text = response.text ?? "{}";
        const parsed = JSON.parse(text) as {
          rootCause?: string;
          fixSteps?: string[];
          impactAssessment?: string;
          confidence?: number;
          autoResolvable?: boolean;
          preventionTips?: string[];
        };

        if (parsed.rootCause) {
          if (parsed.rootCause) {
            await db.update(errorReportsTable)
              .set({ rootCause: parsed.rootCause, updatedAt: new Date() })
              .where(eq(errorReportsTable.id, id!));
          }
          return sendSuccess(res, { ...parsed, fallback: false, errorId: id });
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "Gemini analysis failed — switching to rule-based fallback");
      }
    }

    /* ── Rule-based fallback ───────────────────────────────────────────── */
    const rca = analyzeErrorCauseServer(report.errorType, report.errorMessage);
    return sendSuccess(res, {
      rootCause: rca.causes.join("; ") || "Root cause could not be determined automatically.",
      fixSteps: rca.fixes,
      impactAssessment: rca.consequences.join("; ") || report.shortImpact || "Investigate for user impact.",
      confidence: 0.4,
      autoResolvable: false,
      preventionTips: [],
      fallback: true,
      errorId: id,
    });
  } catch (err) {
    logger.error({ err }, "AI analyze failed");
    sendError(res, "AI analysis failed", 500);
  }
});

router.get("/auto-resolve-log", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"))));
    const logs = await db.select().from(autoResolveLogTable)
      .orderBy(desc(autoResolveLogTable.createdAt))
      .limit(limit);

    sendSuccess(res, logs.map(l => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Failed to fetch auto-resolve log");
    sendError(res, "Failed to fetch auto-resolve log", 500);
  }
});

function analyzeErrorCauseServer(errorType: string, errorMessage: string): { causes: string[]; consequences: string[]; fixes: string[] } {
  const msg = (errorMessage || "").toLowerCase();
  const causes: string[] = [];
  const consequences: string[] = [];
  const fixes: string[] = [];

  switch (errorType) {
    case "db_error":
      causes.push("Database connection pool exhausted or timed out");
      causes.push("Invalid SQL query or schema mismatch after migration");
      consequences.push("Users cannot place orders, make payments, or read data");
      consequences.push("Background jobs that write to DB will fail silently");
      fixes.push("Check database server health and connection pool settings");
      fixes.push("Review recent schema migrations for conflicts");
      break;
    case "frontend_crash":
      causes.push("Unhandled null/undefined reference inside a React component");
      causes.push("Incompatible or unexpected shape of API response data");
      consequences.push("User sees a blank white screen and cannot continue");
      consequences.push("Potential loss of unsaved user input or cart items");
      fixes.push("Wrap risky components in React Error Boundaries");
      fixes.push("Add optional chaining and null checks before rendering");
      break;
    case "api_error":
      causes.push("Third-party service or microservice is unavailable");
      causes.push("Unhandled exception in server-side route handler");
      consequences.push("Feature or page the user was using becomes unavailable");
      consequences.push("Failed API calls may leave the UI in a broken loading state");
      fixes.push("Add proper try/catch in all route handlers");
      fixes.push("Implement retry logic with exponential backoff on the client");
      break;
    case "route_error":
      causes.push("Route handler threw an unhandled exception");
      causes.push("Middleware blocking request before it reaches handler");
      consequences.push("Endpoint is completely down for all users");
      fixes.push("Check the route registration and middleware order");
      fixes.push("Add global error handler middleware");
      break;
    case "ui_error":
      causes.push("CSS/style conflict causing layout to break");
      causes.push("Component receiving wrong prop types");
      consequences.push("UI elements overlap, disappear, or display incorrectly");
      fixes.push("Inspect component props and validate at runtime");
      fixes.push("Use browser DevTools to identify style conflicts");
      break;
    case "unhandled_exception":
      causes.push("Code path missing error handling");
      causes.push("Async operation without proper catch/rejection handler");
      consequences.push("App may crash or behave unpredictably");
      fixes.push("Add global unhandled rejection and uncaught exception handlers");
      fixes.push("Review async code paths for missing try/catch blocks");
      break;
  }

  if (msg.includes("auth") || msg.includes("token") || msg.includes("session")) {
    causes.push("Authentication token expired or invalid");
    fixes.push("Check token refresh logic and session management");
  }
  if (msg.includes("payment") || msg.includes("stripe") || msg.includes("transaction")) {
    causes.push("Payment gateway connectivity or configuration issue");
    fixes.push("Verify payment gateway credentials and webhook configuration");
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    causes.push("Network timeout or slow external dependency");
    fixes.push("Increase timeout thresholds or add circuit breaker pattern");
  }

  return { causes, consequences, fixes };
}

router.post("/:id/generate-task", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [report] = await db.select().from(errorReportsTable)
      .where(eq(errorReportsTable.id, id!))
      .limit(1);

    if (!report) {
      sendNotFound(res, "Error report not found");
      return;
    }

    const severityLabel = report.severity.toUpperCase();
    const typeLabel = report.errorType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const sourceLabel = report.sourceApp === "api" ? "API Server" : report.sourceApp.charAt(0).toUpperCase() + report.sourceApp.slice(1);

    const taskPlan = [
      `# Bug Fix Task: ${typeLabel}`,
      ``,
      `## Summary`,
      `- **Severity**: ${severityLabel}`,
      `- **Source**: ${sourceLabel}`,
      `- **Type**: ${typeLabel}`,
      `- **Error ID**: ${report.id}`,
      `- **Reported**: ${report.timestamp.toISOString()}`,
      ``,
      `## Error Message`,
      `\`\`\``,
      report.errorMessage,
      `\`\`\``,
      ``,
    ];

    if (report.functionName || report.moduleName || report.componentName) {
      taskPlan.push(`## Location`);
      if (report.moduleName) taskPlan.push(`- **Module**: \`${report.moduleName}\``);
      if (report.functionName) taskPlan.push(`- **Function**: \`${report.functionName}\``);
      if (report.componentName) taskPlan.push(`- **Component**: \`${report.componentName}\``);
      taskPlan.push(``);
    }

    if (report.stackTrace) {
      taskPlan.push(`## Stack Trace`);
      taskPlan.push(`\`\`\``);
      taskPlan.push(report.stackTrace.slice(0, 3000));
      taskPlan.push(`\`\`\``);
      taskPlan.push(``);
    }

    if (report.shortImpact) {
      taskPlan.push(`## Impact`);
      taskPlan.push(report.shortImpact);
      taskPlan.push(``);
    }

    const rca = analyzeErrorCauseServer(report.errorType, report.errorMessage);
    if (rca.causes.length > 0) {
      taskPlan.push(`## Likely Root Causes`);
      rca.causes.forEach(c => taskPlan.push(`- ${c}`));
      taskPlan.push(``);
    }
    if (rca.fixes.length > 0) {
      taskPlan.push(`## Recommended Fixes`);
      rca.fixes.forEach(f => taskPlan.push(`- ${f}`));
      taskPlan.push(``);
    }
    if (rca.consequences.length > 0) {
      taskPlan.push(`## Potential Consequences If Unresolved`);
      rca.consequences.forEach(c => taskPlan.push(`- ${c}`));
      taskPlan.push(``);
    }

    taskPlan.push(`## Suggested Investigation Steps`);
    taskPlan.push(`1. Review the error message and stack trace above`);
    taskPlan.push(`2. Identify the root cause in the ${sourceLabel} codebase`);
    taskPlan.push(`3. Write a fix and add appropriate error handling`);
    taskPlan.push(`4. Add tests to prevent regression`);
    taskPlan.push(`5. Deploy and verify the fix in staging`);
    taskPlan.push(``);
    taskPlan.push(`## Priority`);
    taskPlan.push(report.severity === "critical" ? `HIGH — This is a critical error affecting users. Fix ASAP.` :
      report.severity === "medium" ? `MEDIUM — This error impacts functionality. Schedule for next sprint.` :
      `LOW — Minor issue. Can be addressed when convenient.`);

    const markdown = taskPlan.join("\n");

    const now = new Date();
    await db.update(errorReportsTable)
      .set({
        resolutionMethod: "task_created",
        updatedAt: now,
      })
      .where(eq(errorReportsTable.id, id!));

    sendSuccess(res, { taskPlan: markdown, errorId: id });
  } catch (err) {
    logger.error({ err }, "Failed to generate task plan");
    sendError(res, "Failed to generate task plan", 500);
  }
});

let _resolutionMigrated = false;
export async function ensureErrorResolutionTables() {
  if (_resolutionMigrated) return;
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE resolution_method AS ENUM ('manual', 'auto_resolved', 'task_created');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  } catch {}
  try {
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS resolution_method resolution_method`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS resolution_notes TEXT`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS root_cause TEXT`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS error_hash TEXT`);
    await db.execute(sql`ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_error_reports_hash ON error_reports (error_hash, status, timestamp)`);
  } catch {}
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS error_resolution_backups (
        id TEXT PRIMARY KEY,
        error_report_id TEXT NOT NULL,
        previous_status TEXT NOT NULL,
        previous_data JSONB NOT NULL,
        resolution_method TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMP NOT NULL
      )
    `);
  } catch {}
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auto_resolve_log (
        id TEXT PRIMARY KEY,
        error_report_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        rule_matched TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
  } catch {}
  _resolutionMigrated = true;
}

export default router;

export { classifySeverity, classifyImpact, VALID_SOURCE_APPS, VALID_ERROR_TYPES };
