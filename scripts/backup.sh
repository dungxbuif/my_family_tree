#!/usr/bin/env bash
set -euo pipefail

# This script backups the database and the uploads directory.
# Usage: ./scripts/backup.sh [backup_dir]

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/$TIMESTAMP"

DB_SERVICE="db"
DB_USER="postgres"
DB_NAME="family_tree"

mkdir -p "$DEST"

echo "Backing up database..."
docker compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" "$DB_NAME" > "$DEST/db_dump.sql"

echo "Backing up uploads..."
if [ -d "./uploads" ]; then
  cp -r ./uploads "$DEST/uploads"
else
  echo "Warning: ./uploads directory not found. Skipping uploads backup."
fi

echo "Backup completed successfully at: $DEST"
echo "To restore the database: docker compose exec -T $DB_SERVICE psql -U $DB_USER $DB_NAME < $DEST/db_dump.sql"
