-- Out-of-band admin password reset detection.
--
-- Stores a per-admin snapshot of the sha256 of `admin_accounts.secret`
-- at the moment the application last set or observed the password via a
-- *known* in-app code path (seed, reset link, authenticated change). At
-- startup the API compares the current `admin_accounts.secret` against
-- the snapshot; a mismatch with no recorded snapshot bump means somebody
-- rewrote the admin's password directly in the database (e.g. for
-- account recovery via psql), and the affected admin is emailed plus an
-- audit-log row is written so the event appears in the same trail as
-- the in-app reset events.
--
-- The first time the watchdog runs against a pre-existing admin row the
-- snapshot is simply created (no alert fired) — the absence of prior
-- state can't distinguish "this admin existed before the watchdog
-- shipped" from "somebody just rewrote the hash", so we never alert on
-- the seed observation.

CREATE TABLE IF NOT EXISTS "admin_password_hash_snapshots" (
  "admin_id"            text PRIMARY KEY
    REFERENCES "admin_accounts"("id") ON DELETE CASCADE,
  "secret_hash"         text NOT NULL,
  "password_changed_at" timestamp,
  "last_verified_at"    timestamp NOT NULL DEFAULT NOW(),
  "updated_at"          timestamp NOT NULL DEFAULT NOW()
);
