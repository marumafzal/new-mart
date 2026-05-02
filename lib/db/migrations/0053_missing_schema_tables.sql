-- Migration: Create missing schema tables
-- Tables defined in Drizzle schema but never migrated to the database.

-- 1. campaigns (no dependencies)
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"           TEXT PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "theme"        TEXT NOT NULL DEFAULT 'general',
  "color_from"   TEXT NOT NULL DEFAULT '#7C3AED',
  "color_to"     TEXT NOT NULL DEFAULT '#4F46E5',
  "banner_image" TEXT,
  "priority"     INTEGER NOT NULL DEFAULT 0,
  "budget_cap"   NUMERIC(12,2),
  "budget_spent" NUMERIC(12,2) NOT NULL DEFAULT '0',
  "start_date"   TIMESTAMP NOT NULL,
  "end_date"     TIMESTAMP NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'draft',
  "created_by"   TEXT,
  "approved_by"  TEXT,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "campaigns_status_idx"     ON "campaigns" ("status");
CREATE INDEX IF NOT EXISTS "campaigns_start_date_idx" ON "campaigns" ("start_date");
CREATE INDEX IF NOT EXISTS "campaigns_end_date_idx"   ON "campaigns" ("end_date");
CREATE INDEX IF NOT EXISTS "campaigns_priority_idx"   ON "campaigns" ("priority");

-- 2. offers (depends on campaigns)
CREATE TABLE IF NOT EXISTS "offers" (
  "id"               TEXT PRIMARY KEY,
  "campaign_id"      TEXT REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "type"             TEXT NOT NULL,
  "code"             TEXT UNIQUE,
  "discount_pct"     NUMERIC(5,2),
  "discount_flat"    NUMERIC(10,2),
  "min_order_amount" NUMERIC(10,2) NOT NULL DEFAULT '0',
  "max_discount"     NUMERIC(10,2),
  "buy_qty"          INTEGER,
  "get_qty"          INTEGER,
  "cashback_pct"     NUMERIC(5,2),
  "cashback_max"     NUMERIC(10,2),
  "free_delivery"    BOOLEAN NOT NULL DEFAULT FALSE,
  "targeting_rules"  JSONB NOT NULL DEFAULT '{}',
  "stackable"        BOOLEAN NOT NULL DEFAULT FALSE,
  "usage_limit"      INTEGER,
  "usage_per_user"   INTEGER NOT NULL DEFAULT 1,
  "used_count"       INTEGER NOT NULL DEFAULT 0,
  "applies_to"       TEXT NOT NULL DEFAULT 'all',
  "vendor_id"        TEXT,
  "status"           TEXT NOT NULL DEFAULT 'draft',
  "start_date"       TIMESTAMP NOT NULL,
  "end_date"         TIMESTAMP NOT NULL,
  "created_by"       TEXT,
  "approved_by"      TEXT,
  "sort_order"       INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "offers_campaign_id_idx" ON "offers" ("campaign_id");
CREATE INDEX IF NOT EXISTS "offers_status_idx"      ON "offers" ("status");
CREATE INDEX IF NOT EXISTS "offers_type_idx"        ON "offers" ("type");
CREATE INDEX IF NOT EXISTS "offers_code_idx"        ON "offers" ("code");
CREATE INDEX IF NOT EXISTS "offers_start_date_idx"  ON "offers" ("start_date");
CREATE INDEX IF NOT EXISTS "offers_end_date_idx"    ON "offers" ("end_date");
CREATE INDEX IF NOT EXISTS "offers_applies_to_idx"  ON "offers" ("applies_to");
CREATE INDEX IF NOT EXISTS "offers_vendor_id_idx"   ON "offers" ("vendor_id");

-- 3. offer_templates (no dependencies)
CREATE TABLE IF NOT EXISTS "offer_templates" (
  "id"               TEXT PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "type"             TEXT NOT NULL,
  "code"             TEXT,
  "discount_pct"     NUMERIC(5,2),
  "discount_flat"    NUMERIC(10,2),
  "min_order_amount" NUMERIC(10,2) NOT NULL DEFAULT '0',
  "max_discount"     NUMERIC(10,2),
  "buy_qty"          INTEGER,
  "get_qty"          INTEGER,
  "cashback_pct"     NUMERIC(5,2),
  "cashback_max"     NUMERIC(10,2),
  "free_delivery"    BOOLEAN NOT NULL DEFAULT FALSE,
  "targeting_rules"  JSONB NOT NULL DEFAULT '{}',
  "stackable"        BOOLEAN NOT NULL DEFAULT FALSE,
  "usage_limit"      INTEGER,
  "usage_per_user"   INTEGER NOT NULL DEFAULT 1,
  "applies_to"       TEXT NOT NULL DEFAULT 'all',
  "sort_order"       INTEGER NOT NULL DEFAULT 0,
  "created_by"       TEXT,
  "created_at"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. offer_redemptions (depends on offers)
CREATE TABLE IF NOT EXISTS "offer_redemptions" (
  "id"         TEXT PRIMARY KEY,
  "offer_id"   TEXT NOT NULL REFERENCES "offers"("id") ON DELETE CASCADE,
  "user_id"    TEXT NOT NULL,
  "order_id"   TEXT,
  "discount"   NUMERIC(10,2) NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "offer_redemptions_offer_id_idx"    ON "offer_redemptions" ("offer_id");
CREATE INDEX IF NOT EXISTS "offer_redemptions_user_id_idx"     ON "offer_redemptions" ("user_id");
CREATE INDEX IF NOT EXISTS "offer_redemptions_order_id_idx"    ON "offer_redemptions" ("order_id");
CREATE INDEX IF NOT EXISTS "offer_redemptions_created_at_idx"  ON "offer_redemptions" ("created_at");

-- 5. campaign_participations (depends on campaigns)
CREATE TABLE IF NOT EXISTS "campaign_participations" (
  "id"          TEXT PRIMARY KEY,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "vendor_id"   TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "notes"       TEXT,
  "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "campaign_participations_campaign_id_idx" ON "campaign_participations" ("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_participations_vendor_id_idx"   ON "campaign_participations" ("vendor_id");

-- 6. popup_templates (no dependencies)
CREATE TABLE IF NOT EXISTS "popup_templates" (
  "id"                TEXT PRIMARY KEY,
  "name"              TEXT NOT NULL,
  "description"       TEXT,
  "category"          TEXT DEFAULT 'general',
  "popup_type"        TEXT NOT NULL DEFAULT 'modal',
  "default_title"     TEXT,
  "default_body"      TEXT,
  "default_cta_text"  TEXT,
  "color_from"        TEXT NOT NULL DEFAULT '#7C3AED',
  "color_to"          TEXT NOT NULL DEFAULT '#4F46E5',
  "text_color"        TEXT NOT NULL DEFAULT '#FFFFFF',
  "animation"         TEXT DEFAULT 'fade',
  "style_preset"      TEXT DEFAULT 'default',
  "preview_image_url" TEXT,
  "is_built_in"       BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active"         BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 7. popup_campaigns (no dependencies)
CREATE TABLE IF NOT EXISTS "popup_campaigns" (
  "id"                      TEXT PRIMARY KEY,
  "title"                   TEXT NOT NULL,
  "body"                    TEXT,
  "media_url"               TEXT,
  "cta_text"                TEXT,
  "cta_link"                TEXT,
  "popup_type"              TEXT NOT NULL DEFAULT 'modal',
  "display_frequency"       TEXT NOT NULL DEFAULT 'once',
  "max_impressions_per_user" INTEGER DEFAULT 1,
  "max_total_impressions"   INTEGER,
  "priority"                INTEGER NOT NULL DEFAULT 0,
  "start_date"              TIMESTAMP,
  "end_date"                TIMESTAMP,
  "timezone"                TEXT DEFAULT 'Asia/Karachi',
  "targeting"               JSONB DEFAULT '{}',
  "status"                  TEXT NOT NULL DEFAULT 'draft',
  "style_preset"            TEXT DEFAULT 'default',
  "color_from"              TEXT DEFAULT '#7C3AED',
  "color_to"                TEXT DEFAULT '#4F46E5',
  "text_color"              TEXT DEFAULT '#FFFFFF',
  "animation"               TEXT DEFAULT 'fade',
  "template_id"             TEXT,
  "created_by"              TEXT,
  "created_at"              TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "popup_campaigns_status_idx"     ON "popup_campaigns" ("status");
CREATE INDEX IF NOT EXISTS "popup_campaigns_priority_idx"   ON "popup_campaigns" ("priority");
CREATE INDEX IF NOT EXISTS "popup_campaigns_start_date_idx" ON "popup_campaigns" ("start_date");
CREATE INDEX IF NOT EXISTS "popup_campaigns_end_date_idx"   ON "popup_campaigns" ("end_date");

-- 8. popup_impressions (no hard FK, just uses popup_id text)
CREATE TABLE IF NOT EXISTS "popup_impressions" (
  "id"         TEXT PRIMARY KEY,
  "popup_id"   TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "action"     TEXT NOT NULL DEFAULT 'view',
  "seen_at"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "session_id" TEXT
);
CREATE INDEX IF NOT EXISTS "popup_impressions_popup_id_idx"   ON "popup_impressions" ("popup_id");
CREATE INDEX IF NOT EXISTS "popup_impressions_user_id_idx"    ON "popup_impressions" ("user_id");
CREATE INDEX IF NOT EXISTS "popup_impressions_popup_user_idx" ON "popup_impressions" ("popup_id", "user_id");

-- 9. faqs (no dependencies)
CREATE TABLE IF NOT EXISTS "faqs" (
  "id"         TEXT PRIMARY KEY,
  "category"   TEXT NOT NULL DEFAULT 'General',
  "question"   TEXT NOT NULL,
  "answer"     TEXT NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. release_notes (no dependencies)
CREATE TABLE IF NOT EXISTS "release_notes" (
  "id"           TEXT PRIMARY KEY,
  "version"      TEXT NOT NULL,
  "release_date" TEXT NOT NULL,
  "notes"        TEXT NOT NULL,
  "sort_order"   INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 11. admin_sessions (depends on admin_accounts)
CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id"                TEXT PRIMARY KEY,
  "admin_id"          TEXT NOT NULL REFERENCES "admin_accounts"("id") ON DELETE CASCADE,
  "refresh_token_hash" TEXT NOT NULL,
  "ip"                VARCHAR(45) NOT NULL,
  "user_agent"        TEXT,
  "csrf_token_hash"   TEXT,
  "created_at"        TIMESTAMP NOT NULL DEFAULT NOW(),
  "expires_at"        TIMESTAMP NOT NULL,
  "last_used_at"      TIMESTAMP DEFAULT NOW(),
  "revoked_at"        TIMESTAMP
);
