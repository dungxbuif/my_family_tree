#!/usr/bin/env bash
set -euo pipefail

# This script runs the initial migration inside the Docker container.
# Usage: ./scripts/migrate-production.sh

# Default values for production-like DB inside docker network
DB_SERVICE="db"
DB_USER="postgres"
DB_NAME="family_tree"

echo "Waiting for database to be ready..."
# Simple wait loop
until docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo " DB is up!"

exec bash scripts/migrate-local-dev.sh
