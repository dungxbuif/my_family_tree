#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
schema_file="${FAMILY_TREE_SCHEMA_FILE:-$script_dir/schema.sql}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL must be set." >&2
  exit 1
fi

if [[ ! -r "$schema_file" ]]; then
  echo "Schema file is not readable: $schema_file" >&2
  exit 1
fi

docker run --rm \
  --mount "type=bind,src=$schema_file,dst=/schema.sql,readonly" \
  postgres:16-alpine \
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /schema.sql
