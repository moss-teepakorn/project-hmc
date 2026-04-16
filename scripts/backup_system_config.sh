#!/usr/bin/env bash
set -euo pipefail

# Usage: DATABASE_URL=postgres://... ./scripts/backup_system_config.sh
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is required."
  exit 2
fi

OUT_DIR="$(dirname "$0")/../backups"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/system_config_backup_$(date +%Y%m%d_%H%M%S).csv"

echo "Backing up system_config to $OUT_FILE"
psql "$DB_URL" -c "COPY (SELECT * FROM system_config) TO STDOUT WITH CSV HEADER" > "$OUT_FILE"
echo "Backup completed."
