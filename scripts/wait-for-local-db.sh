#!/usr/bin/env bash
set -euo pipefail

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-my-family-tree}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-family_tree}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"

deadline=$((SECONDS + TIMEOUT_SECONDS))

while (( SECONDS < deadline )); do
  if docker compose ps --status running "$DB_SERVICE" >/dev/null 2>&1 &&
    docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo "Local database is ready."
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for local database." >&2
docker compose ps >&2 || true
exit 1
