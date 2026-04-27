-- Wire backend storage for vendor inventory settings and the consent /
-- terms-version pages added during the bugs.md remediation.
--
-- 1. Extend `consent_log` with the GDPR audit trail fields the admin
--    consent log surface expects (user agent + source channel).
-- 2. Add a dedicated `terms_versions` table so admins can publish a new
--    version of a policy and force re-acceptance on next launch. Primary
--    key on (policy, version) is what gives us idempotent POSTs.
-- 3. Add nullable per-product overrides for the new inventory settings
--    surface (`products.low_stock_threshold`, `max_quantity_per_order`,
--    `back_in_stock_notify`). NULL means "use the platform-wide default
--    from inventory_*` settings".

ALTER TABLE "consent_log"
  ADD COLUMN IF NOT EXISTS "user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE TABLE IF NOT EXISTS "terms_versions" (
  "policy"        TEXT NOT NULL,
  "version"       TEXT NOT NULL,
  "effective_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
  "body_markdown" TEXT,
  "changelog"     TEXT,
  "created_at"    TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("policy", "version")
);

CREATE INDEX IF NOT EXISTS "terms_versions_policy_effective_idx"
  ON "terms_versions" ("policy", "effective_at" DESC);

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "low_stock_threshold"     INTEGER,
  ADD COLUMN IF NOT EXISTS "max_quantity_per_order"  INTEGER,
  ADD COLUMN IF NOT EXISTS "back_in_stock_notify"    BOOLEAN NOT NULL DEFAULT TRUE;
