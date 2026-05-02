-- Migration 0056: Rename ride_ratings.user_id → customer_id, create support_messages
-- Discovered by /api/health/schema-drift endpoint (Task #11)

-- ─────────────────────────────────────────────────────────────
-- 1. ride_ratings: rename user_id → customer_id
--    The Drizzle schema uses customer_id but the DB column is user_id.
--    Routes already reference rideRatingsTable.customerId so this is
--    a crash risk on any query that filters/joins by the customer.
--    We use a DO block to make this idempotent: skip if customer_id
--    already exists (rename already ran), otherwise rename.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Only rename if user_id exists AND customer_id does NOT yet exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ride_ratings'
      AND column_name  = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ride_ratings'
      AND column_name  = 'customer_id'
  ) THEN
    ALTER TABLE ride_ratings RENAME COLUMN user_id TO customer_id;
  END IF;
END
$$;

-- Drop the old index named after user_id if it still exists after the rename
DROP INDEX IF EXISTS ride_ratings_user_id_idx;
-- Ensure the canonical index expected by the schema exists
CREATE INDEX IF NOT EXISTS ride_ratings_customer_id_idx ON ride_ratings(customer_id);

-- Drop the legacy FK on user_id if it survived the rename
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ride_ratings_user_id_users_id_fk'
      AND table_name = 'ride_ratings'
  ) THEN
    ALTER TABLE ride_ratings DROP CONSTRAINT ride_ratings_user_id_users_id_fk;
  END IF;
END
$$;

-- Ensure the FK on customer_id exists with the correct name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ride_ratings_customer_id_users_id_fk'
      AND table_name = 'ride_ratings'
  ) THEN
    ALTER TABLE ride_ratings
      ADD CONSTRAINT ride_ratings_customer_id_users_id_fk
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. support_messages: create table (defined in schema, absent from DB)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_messages (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  message          TEXT NOT NULL,
  is_from_support  BOOLEAN NOT NULL DEFAULT false,
  is_read_by_admin BOOLEAN NOT NULL DEFAULT false,
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
