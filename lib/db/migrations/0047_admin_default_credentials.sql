-- Track whether an admin row is still using its bootstrap default
-- credentials. Drives the optional first-login popup.
ALTER TABLE "admin_accounts"
  ADD COLUMN IF NOT EXISTS "default_credentials" boolean NOT NULL DEFAULT false;
