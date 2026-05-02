-- Migration 0054: Add ajk_id and accepted_terms_version columns to users table.
-- These were added to the Drizzle schema after the initial migration was already
-- applied, so they never got created in existing databases.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ajk_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT;

CREATE INDEX IF NOT EXISTS users_ajk_id_idx ON users (ajk_id);
