#!/bin/sh
# Backs up the Postgres database and the storage/ directory (uploaded images
# + trained models) to timestamped files under backups/. Safe to run while
# the stack is up — pg_dump takes a consistent snapshot without locking
# writers.
#
# Usage: ./scripts/backup.sh [backups_dir]
#   (defaults to ./backups relative to the repo root)
#
# Schedule it with cron (Linux/Mac) or Windows Task Scheduler, e.g. nightly:
#   0 2 * * * cd /path/to/marineAnnotate && ./scripts/backup.sh
set -eu

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

DB_CONTAINER="$(docker compose ps -q db)"
if [ -z "$DB_CONTAINER" ]; then
  echo "db container is not running — start the stack first (docker compose up -d)" >&2
  exit 1
fi

POSTGRES_USER="$(grep '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2)"
POSTGRES_DB="$(grep '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2)"
POSTGRES_USER="${POSTGRES_USER:-marine}"
POSTGRES_DB="${POSTGRES_DB:-marine_annotate}"

echo "Dumping database..."
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_DIR/db_${STAMP}.sql.gz"

echo "Archiving storage/ (images + models)..."
tar -czf "$BACKUP_DIR/storage_${STAMP}.tar.gz" storage/

echo "Done:"
echo "  $BACKUP_DIR/db_${STAMP}.sql.gz"
echo "  $BACKUP_DIR/storage_${STAMP}.tar.gz"

# Keep the last 14 backups of each kind — adjust to taste.
KEEP=14
for prefix in db storage; do
  ls -1t "$BACKUP_DIR/${prefix}_"*.* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --
done
