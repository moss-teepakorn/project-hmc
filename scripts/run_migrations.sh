#!/usr/bin/env bash
set -euo pipefail

# Usage: DATABASE_URL=postgres://... ./scripts/run_migrations.sh

DB_URL="${DATABASE_URL:-}" 
if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is required."
  echo "Example: DATABASE_URL=postgres://user:pass@host:5432/dbname ./scripts/run_migrations.sh"
  exit 2
fi

MIGRATIONS_DIR="$(dirname "$0")/../migrations"
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory found at $MIGRATIONS_DIR"
  exit 1
fi

echo "Running migrations from $MIGRATIONS_DIR against $DB_URL"

for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "--- Applying: $(basename "$f") ---"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "All migrations applied."
