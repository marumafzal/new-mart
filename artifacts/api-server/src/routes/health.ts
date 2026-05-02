import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

export default router;
