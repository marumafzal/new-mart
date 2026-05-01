-- Admin Action Audit Log table
-- Persists all admin actions (waive debt, OTP reset, session revoke, KYC
-- decisions, user management, etc.) to the database so the audit trail
-- survives server restarts and can be queried with joins.

CREATE TABLE IF NOT EXISTS "admin_action_audit_log" (
  "id"                text PRIMARY KEY,
  "admin_id"          text REFERENCES "admin_accounts"("id") ON DELETE SET NULL,
  "admin_name"        text,
  "ip"                varchar(45) NOT NULL DEFAULT 'unknown',
  "action"            text NOT NULL,
  "result"            varchar(20) NOT NULL DEFAULT 'success',
  "details"           text,
  "affected_user_id"  text REFERENCES "users"("id") ON DELETE SET NULL,
  "affected_user_name" text,
  "affected_user_role" text,
  "created_at"        timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "admin_action_audit_log_admin_idx"
  ON "admin_action_audit_log" ("admin_id");

CREATE INDEX IF NOT EXISTS "admin_action_audit_log_action_idx"
  ON "admin_action_audit_log" ("action");

CREATE INDEX IF NOT EXISTS "admin_action_audit_log_created_idx"
  ON "admin_action_audit_log" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "admin_action_audit_log_affected_user_idx"
  ON "admin_action_audit_log" ("affected_user_id");
