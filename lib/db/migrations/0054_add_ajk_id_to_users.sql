ALTER TABLE users ADD COLUMN IF NOT EXISTS ajk_id text UNIQUE;
CREATE INDEX IF NOT EXISTS users_ajk_id_idx ON users (ajk_id);
