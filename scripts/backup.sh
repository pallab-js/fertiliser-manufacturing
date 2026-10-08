#!/usr/bin/env bash
# Online-safe SQLite backup (never raw-copy a WAL database).
# Usage: ./scripts/backup.sh [target-dir]
set -euo pipefail

DB="${NOTER_DB:-data/noter.db}"
DIR="${1:-data/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$DIR/noter-$STAMP.db"

[ -f "$DB" ] || { echo "No database at $DB"; exit 1; }
mkdir -p "$DIR"
sqlite3 "$DB" ".backup '$DEST'"
chmod 600 "$DEST"

# keep newest 14 backups
ls -1t "$DIR"/noter-*.db 2>/dev/null | tail -n +15 | xargs rm -f 2>/dev/null || true
echo "Backed up $DB → $DEST"
