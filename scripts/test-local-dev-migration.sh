#!/usr/bin/env bash
set -euo pipefail

docker compose up -d db
bash scripts/wait-for-local-db.sh
bash scripts/migrate-local-dev.sh

docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d family_tree <<'SQL'
BEGIN;
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
      ('public.gallery_items', to_regclass('public.gallery_items')),
      ('public.schema_migrations', to_regclass('public.schema_migrations')),
      ('public.family_trees', to_regclass('public.family_trees')),
      ('public.tree_memberships', to_regclass('public.tree_memberships')),
      ('public.native_access_submissions', to_regclass('public.native_access_submissions')),
      ('public.person_creation_receipts', to_regclass('public.person_creation_receipts')),
      ('public.tree_media', to_regclass('public.tree_media')),
      ('public.api_keys', to_regclass('public.api_keys')),
      ('public.api_audit_logs', to_regclass('public.api_audit_logs'))
  ) AS required(name, regclass)
  WHERE regclass IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing migrated relations: %', missing;
  END IF;
END $$;

INSERT INTO public.users (email,password_hash)
VALUES ('smoke-' || gen_random_uuid() || '@example.test', 'fixture')
RETURNING id AS user_id \gset
INSERT INTO public.family_trees(name) VALUES ('Migration smoke') RETURNING id AS tree_id \gset
INSERT INTO public.tree_memberships(tree_id,user_id,role) VALUES (:'tree_id', :'user_id', 'owner');
INSERT INTO public.persons(tree_id,full_name,gender) VALUES (:'tree_id', 'Local Dev Migration Check', 'other');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
SQL

echo "Local development migration test passed."
