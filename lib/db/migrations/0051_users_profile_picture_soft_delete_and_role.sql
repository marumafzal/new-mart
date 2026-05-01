-- Migration: 0051_users_profile_picture_soft_delete_and_role
-- Adds user profile picture URL, soft delete columns, and a singular role enum for centralized user state.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('customer', 'rider', 'vendor', 'admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'customer';
  ELSE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'role' AND udt_name <> 'user_role'
    ) THEN
      ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
    END IF;
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    UPDATE users
    SET role = CASE
      WHEN roles ILIKE '%admin%' THEN 'admin'
      WHEN roles ILIKE '%vendor%' THEN 'vendor'
      WHEN roles ILIKE '%rider%' THEN 'rider'
      ELSE 'customer'
    END
    WHERE (role IS NULL OR role = 'customer')
      AND roles IS NOT NULL
      AND roles <> ''
      AND roles <> 'customer';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_is_deleted_idx ON users (is_deleted);
