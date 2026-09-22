#!/usr/bin/env bash
set -euo pipefail

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-family_tree}"

run_psql_file() {
  local file="$1"
  docker compose exec -T "$DB_SERVICE" psql \
    -v ON_ERROR_STOP=1 \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f - < "$file"
}

run_psql_file "docs/schema.sql"

echo "Local development migration completed."
