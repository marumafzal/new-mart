#!/bin/bash
set -e

# Decrypt .env non-interactively (no-op if already present or .env.enc missing)
node scripts/auto-decrypt.mjs

# Load env vars from .env into the shell environment for subsequent commands
set -a
[ -f .env ] && source .env
set +a

# Only run pnpm install if node_modules is missing or lockfile is newer than install marker
INSTALL_MARKER="node_modules/.post-merge-install-marker"
if [ ! -d "node_modules" ] || [ ! -f "$INSTALL_MARKER" ] || [ "pnpm-lock.yaml" -nt "$INSTALL_MARKER" ]; then
  echo "[post-merge] Running pnpm install..."
  pnpm install --no-frozen-lockfile
  touch "$INSTALL_MARKER"
else
  echo "[post-merge] node_modules up to date, skipping install"
fi

# Build library packages so TypeScript declaration files are up to date
pnpm --filter @workspace/db build
pnpm --filter @workspace/phone-utils build

# Run pending SQL migrations manually (non-interactive, no drizzle-kit push)
# This avoids drizzle-kit's interactive prompts about column renames
MIGRATION_DIR="lib/db/migrations"
DB_URL="${NEON_DATABASE_URL:-${APP_DATABASE_URL:-$DATABASE_URL}}"

if [ -z "$DB_URL" ]; then
  echo "[migration] NEON_DATABASE_URL, APP_DATABASE_URL, or DATABASE_URL must be set"
  exit 1
fi

psql "$DB_URL" -c "
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  );
" 2>&1

# Apply each migration file in order if not already applied
for sql_file in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
  filename=$(basename "$sql_file")
  already_applied=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM _schema_migrations WHERE filename = '$filename';")
  if [ "$already_applied" -eq "0" ]; then
    echo "[migration] Applying $filename..."
    psql "$DB_URL" -f "$sql_file" 2>&1 && \
      psql "$DB_URL" -c "INSERT INTO _schema_migrations (filename) VALUES ('$filename');" 2>&1
    echo "[migration] Applied $filename"
  else
    echo "[migration] Skipping $filename (already applied)"
  fi
done

echo "[post-merge] Done"
