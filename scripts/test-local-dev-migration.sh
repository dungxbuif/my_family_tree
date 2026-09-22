#!/usr/bin/env bash
set -euo pipefail

docker compose up -d db
bash scripts/wait-for-local-db.sh
bash scripts/migrate-local-dev.sh

docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d family_tree <<'SQL'
SET search_path TO public;

DO $$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(name)
  INTO missing
  FROM (
    VALUES
      ('public.users'::text, to_regclass('public.users')),
      ('public.sessions', to_regclass('public.sessions')),
      ('public.profiles', to_regclass('public.profiles')),
      ('public.persons', to_regclass('public.persons')),
      ('public.relationships', to_regclass('public.relationships')),
      ('public.person_details_private', to_regclass('public.person_details_private')),
      ('public.custom_events', to_regclass('public.custom_events')),
      ('public.gallery_items', to_regclass('public.gallery_items'))
  ) AS required(name, regclass)
  WHERE regclass IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing migrated relations: %', missing;
  END IF;
END $$;

INSERT INTO public.persons (full_name, gender)
VALUES ('Local Dev Migration Check', 'other')
RETURNING id;

INSERT INTO public.users (email, password_hash)
VALUES ('migration-check@example.test', 'scrypt:test:test')
ON CONFLICT (email) DO NOTHING;
SQL

echo "Local development migration test passed."
