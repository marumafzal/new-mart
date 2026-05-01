import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildPgPoolConfig } from "@workspace/db/connection-url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runSqlMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrations] DATABASE_URL not set, skipping migrations");
    return;
  }
  const pool = new Pool(buildPgPoolConfig(databaseUrl));
  try {
    await pool.query("SELECT 1");
    console.log("[migrations] Database connection successful");
    // Create migrations table if needed (optional)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Run any pending migration files. The migration directory lives at
    // <repo>/lib/db/migrations. From this file (artifacts/api-server/src/services)
    // that's four levels up, not three. Both candidate paths are checked so
    // we behave correctly regardless of build layout (tsx/dev vs. dist).
    const candidateDirs = [
      path.join(__dirname, "../../../../lib/db/migrations"),
      path.join(__dirname, "../../../lib/db/migrations"),
    ];
    const migrationsDir = candidateDirs.find((dir) => fs.existsSync(dir));
    if (migrationsDir) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
      for (const file of files) {
        const { rows } = await pool.query("SELECT 1 FROM _schema_migrations WHERE filename = $1", [file]);
        if (rows.length) continue;
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        try {
          await pool.query(sql);
        } catch (err) {
          console.error(`[migrations] FAILED applying ${file}`, err);
          throw err;
        }
        await pool.query("INSERT INTO _schema_migrations (filename) VALUES ($1)", [file]);
        console.log(`[migrations] Applied ${file}`);
      }
    }
  } finally {
    await pool.end();
  }
}
