#!/bin/sh
# Restores a database dump and/or storage/ archive produced by backup.sh.
# DESTRUCTIVE — overwrites the current database and/or storage directory.
#
# Usage:
#   ./scripts/restore.sh backups/db_20260821_020000.sql.gz backups/storage_20260821_020000.tar.gz
#   ./scripts/restore.sh backups/db_20260821_020000.sql.gz          # DB only
set -eu

cd "$(dirname "$0")/.."

DB_DUMP="${1:-}"
STORAGE_ARCHIVE="${2:-}"

if [ -z "$DB_DUMP" ] && [ -z "$STORAGE_ARCHIVE" ]; then
  echo "Usage: $0 <db_dump.sql.gz> [storage_archive.tar.gz]" >&2
  exit 1
fi

echo "This will OVERWRITE the current database and/or storage/ directory."
printf "Type 'yes' to continue: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

if [ -n "$DB_DUMP" ]; then
  DB_CONTAINER="$(docker compose ps -q db)"
  if [ -z "$DB_CONTAINER" ]; then
    echo "db container is not running — start the stack first (docker compose up -d)" >&2
    exit 1
  fi
  POSTGRES_USER="$(grep '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2)"
  POSTGRES_DB="$(grep '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2)"
  POSTGRES_USER="${POSTGRES_USER:-marine}"
  POSTGRES_DB="${POSTGRES_DB:-marine_annotate}"

  echo "Restoring database from $DB_DUMP ..."
  # Drop and recreate the schema first so the restore starts clean — a plain
  # psql < dump.sql on top of existing tables would fail on every "already
  # exists" statement instead of actually restoring anything.
  docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  gunzip -c "$DB_DUMP" | docker exec -i "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  echo "Database restored."
fi

if [ -n "$STORAGE_ARCHIVE" ]; then
  echo "Restoring storage/ from $STORAGE_ARCHIVE ..."
  rm -rf storage
  tar -xzf "$STORAGE_ARCHIVE"
  echo "storage/ restored."
fi

echo "Restart the stack to pick up the restored data: docker compose up -d --force-recreate backend"
