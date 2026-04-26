CREATE TABLE IF NOT EXISTS "integration_test_history" (
  "id"           text PRIMARY KEY,
  "type"         text NOT NULL,
  "ok"           boolean NOT NULL,
  "latency_ms"   integer NOT NULL DEFAULT 0,
  "message"      text NOT NULL DEFAULT '',
  "error_detail" text,
  "admin_id"     text,
  "created_at"   timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "integration_test_history_type_idx"
  ON "integration_test_history" ("type");

CREATE INDEX IF NOT EXISTS "integration_test_history_created_at_idx"
  ON "integration_test_history" ("created_at");
