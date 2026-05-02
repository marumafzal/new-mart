-- Migration 0055: Add missing columns to existing tables and create missing tables
-- Discovered by schema vs DB diff (Task #11)

-- ─────────────────────────────────────────────────────────────
-- 1. vendor_profiles — add store geo-coordinates
-- ─────────────────────────────────────────────────────────────
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS store_lat  NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS store_lng  NUMERIC(10, 7);

-- ─────────────────────────────────────────────────────────────
-- 2. van_routes — add tiered seat fare columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE van_routes
  ADD COLUMN IF NOT EXISTS fare_window  NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS fare_aisle   NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS fare_economy NUMERIC(10, 2);

-- ─────────────────────────────────────────────────────────────
-- 3. van_schedules — add driver link + trip status
-- ─────────────────────────────────────────────────────────────
ALTER TABLE van_schedules
  ADD COLUMN IF NOT EXISTS van_driver_id TEXT,
  ADD COLUMN IF NOT EXISTS trip_status   TEXT NOT NULL DEFAULT 'idle';

-- ─────────────────────────────────────────────────────────────
-- 4. van_bookings — add tiered seat booking columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE van_bookings
  ADD COLUMN IF NOT EXISTS seat_tiers     JSONB,
  ADD COLUMN IF NOT EXISTS tier_label     TEXT,
  ADD COLUMN IF NOT EXISTS price_paid     NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS tier_breakdown JSONB;

-- ─────────────────────────────────────────────────────────────
-- 5. van_drivers — new table (van service driver registry)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS van_drivers (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  van_code        TEXT NOT NULL UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS van_drivers_user_id_idx  ON van_drivers(user_id);
CREATE INDEX IF NOT EXISTS van_drivers_van_code_idx ON van_drivers(van_code);

-- ─────────────────────────────────────────────────────────────
-- 6. communication_requests — new table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_requests (
  id          TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comm_req_sender_idx   ON communication_requests(sender_id);
CREATE INDEX IF NOT EXISTS comm_req_receiver_idx ON communication_requests(receiver_id);
CREATE INDEX IF NOT EXISTS comm_req_status_idx   ON communication_requests(status);

-- ─────────────────────────────────────────────────────────────
-- 7. call_logs — new table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
  id              TEXT PRIMARY KEY,
  caller_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES comm_conversations(id),
  duration        INTEGER,
  status          TEXT NOT NULL DEFAULT 'initiated',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS call_caller_idx  ON call_logs(caller_id);
CREATE INDEX IF NOT EXISTS call_callee_idx  ON call_logs(callee_id);
CREATE INDEX IF NOT EXISTS call_status_idx  ON call_logs(status);
CREATE INDEX IF NOT EXISTS call_started_idx ON call_logs(started_at);

-- ─────────────────────────────────────────────────────────────
-- 8. communication_roles — new table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_roles (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT,
  permissions      JSONB,
  role_pair_rules  JSONB,
  category_rules   JSONB,
  time_windows     JSONB,
  message_limits   JSONB,
  is_preset        BOOLEAN NOT NULL DEFAULT false,
  created_by_ai    BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 9. communication_flags — new table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_flags (
  id                    TEXT PRIMARY KEY,
  message_id            TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  reason                TEXT NOT NULL,
  keyword               TEXT,
  reviewed_by_admin_id  TEXT,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS flag_msg_idx      ON communication_flags(message_id);
CREATE INDEX IF NOT EXISTS flag_resolved_idx ON communication_flags(resolved_at);

-- ─────────────────────────────────────────────────────────────
-- 10. ai_moderation_logs — new table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_moderation_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  input_text  TEXT,
  output_text TEXT,
  tokens_used INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_log_user_idx    ON ai_moderation_logs(user_id);
CREATE INDEX IF NOT EXISTS ai_log_type_idx    ON ai_moderation_logs(action_type);
CREATE INDEX IF NOT EXISTS ai_log_created_idx ON ai_moderation_logs(created_at);
