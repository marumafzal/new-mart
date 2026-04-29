-- Migration: FCM push token support
-- Adds token_type column and makes p256dh/auth_key nullable
-- so FCM device tokens can be stored alongside VAPID subscriptions.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'vapid';

ALTER TABLE push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL;

ALTER TABLE push_subscriptions
  ALTER COLUMN auth_key DROP NOT NULL;
