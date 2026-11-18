#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
schema_file="${FAMILY_TREE_SCHEMA_FILE:-$root/docs/schema.sql}"
: "${DATABASE_URL:?DATABASE_URL is required}"
docker run --rm -e DATABASE_URL \
  --mount "type=bind,src=$root/docs,dst=/app/docs,readonly" \
  --mount "type=bind,src=$root/scripts,dst=/app/scripts,readonly" \
  --mount "type=bind,src=$schema_file,dst=/app/docs/entry.sql,readonly" \
  "${FAMILY_TREE_IMAGE:-homelab/family-tree:local}" /app/scripts/migrate-release.mjs /app/docs/entry.sql
