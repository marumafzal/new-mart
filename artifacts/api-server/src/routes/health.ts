import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { adminAuth } from "./admin-shared.js";
import { checkSchemaDrift } from "../services/schemaDrift.service.js";

const router = Router();

const SERVER_EPOCH = Math.round(Date.now() / 1000 - process.uptime());

router.get("/", async (req, res) => {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = "error";
  }
  res.json({
    status: "ok",
    uptime: process.uptime(),
    db: dbStatus,
    timestamp: new Date().toISOString(),
    serverEpoch: SERVER_EPOCH,
  });
});

/**
 * GET /api/health/schema-drift
 * Admin-only endpoint that compares the Drizzle schema definition against the
 * live PostgreSQL database and reports any tables or columns that are defined
 * in code but missing from the database (crash risk), as well as extra tables
 * and columns that exist only in the database (informational).
 *
 * Returns HTTP 200 with { ok: true } when the DB fully matches the schema.
 * Returns HTTP 200 with { ok: false, ... } when drift is detected so callers
 * can distinguish "endpoint reachable" from "schema is clean" without relying
 * on HTTP status codes for alerting.
 */
router.get("/schema-drift", adminAuth, async (req, res) => {
  try {
    const report = await checkSchemaDrift();
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
