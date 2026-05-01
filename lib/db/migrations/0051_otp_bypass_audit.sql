/* ──────────────────────────────────────────────────────────────────────────── */
/* 0051_otp_bypass_audit.sql — OTP Bypass Audit Log Table (PostgreSQL)         */
/* ──────────────────────────────────────────────────────────────────────────── */

/* ── OTP Bypass Audit Log ───────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS otp_bypass_audit (
  id              VARCHAR(36)  PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  /* E.g., 'otp_global_disable', 'otp_bypass_granted', 'login_per_user_bypass',
           'login_global_bypass', 'login_whitelist_bypass' */

  user_id         VARCHAR(36),
  admin_id        VARCHAR(36),
  phone           VARCHAR(20),
  email           VARCHAR(255),
  bypass_reason   VARCHAR(100),
  /* E.g., 'admin_action', 'global_disable', 'per_user_bypass', 'whitelist' */

  expires_at      TIMESTAMP    NULL,
  ip_address      VARCHAR(45),
  user_agent      VARCHAR(500),
  metadata        JSONB,

  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_bypass_audit_event_type ON otp_bypass_audit (event_type);
CREATE INDEX IF NOT EXISTS idx_otp_bypass_audit_user_id    ON otp_bypass_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_otp_bypass_audit_admin_id   ON otp_bypass_audit (admin_id);
CREATE INDEX IF NOT EXISTS idx_otp_bypass_audit_created_at ON otp_bypass_audit (created_at);
CREATE INDEX IF NOT EXISTS idx_otp_bypass_audit_phone      ON otp_bypass_audit (phone);
CREATE INDEX IF NOT EXISTS idx_otp_bypass_audit_email      ON otp_bypass_audit (email);

/* ── Per-User OTP Bypass Column (if not already added) ──────────────────────── */
ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_bypass_until TIMESTAMP NULL;
CREATE INDEX IF NOT EXISTS idx_users_otp_bypass_until ON users (otp_bypass_until);

/* ── Constraint on bypass_code format ─────────────────────────────────────────*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bypass_code_format'
  ) THEN
    ALTER TABLE whitelist_users
      ADD CONSTRAINT chk_bypass_code_format
      CHECK (bypass_code ~ '^[0-9]{6}$');
  END IF;
END;
$$;
