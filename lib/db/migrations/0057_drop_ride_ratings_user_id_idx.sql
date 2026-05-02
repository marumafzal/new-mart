-- Migration 0057: Drop orphaned ride_ratings_user_id_idx
-- Migration 0056 renamed the column user_id → customer_id but incorrectly
-- dropped/recreated the customer_id index instead of dropping the old
-- user_id-named index. This migration cleans that up idempotently.
DROP INDEX IF EXISTS ride_ratings_user_id_idx;
CREATE INDEX IF NOT EXISTS ride_ratings_customer_id_idx ON ride_ratings(customer_id);
