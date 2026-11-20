\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(20261119100000);
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SELECT NOT EXISTS (SELECT FROM schema_migrations WHERE version='20261119100000') AS apply \gset
\if :apply

LOCK TABLE users, profiles, sessions, persons, person_details_private, relationships,
           custom_events, gallery_items IN ACCESS EXCLUSIVE MODE;
\set count_prefix before_
\ir ../../scripts/preflight-multi-family-migration.sql
\unset count_prefix

CREATE TABLE family_trees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tree_memberships (
  tree_id uuid NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tree_id,user_id)
);
CREATE INDEX tree_memberships_user ON tree_memberships(user_id);

INSERT INTO family_trees(id,name)
SELECT '00000000-0000-0000-0000-000000000001', 'Gia phả hiện tại'
WHERE EXISTS (SELECT FROM profiles);
INSERT INTO tree_memberships(tree_id,user_id,role)
SELECT '00000000-0000-0000-0000-000000000001', id,
       CASE role WHEN 'admin' THEN 'owner' WHEN 'editor' THEN 'editor' ELSE 'viewer' END
FROM profiles;
ALTER TABLE profiles ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
-- Preserve the original last-edit timestamp for the derived flag.
ALTER TABLE profiles DISABLE TRIGGER tr_profiles_updated_at;
UPDATE profiles SET is_super_admin=true WHERE role='admin';
ALTER TABLE profiles ENABLE TRIGGER tr_profiles_updated_at;

-- A constant default backfills legacy tuples without firing their UPDATE triggers.
-- All future writes must explicitly supply the validated tree.
DO $$
DECLARE
  family_table text;
BEGIN
  FOREACH family_table IN ARRAY ARRAY['persons','person_details_private','relationships','custom_events','gallery_items'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN tree_id uuid NOT NULL DEFAULT %L REFERENCES family_trees(id) ON DELETE CASCADE',
                   family_table, '00000000-0000-0000-0000-000000000001');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tree_id DROP DEFAULT', family_table);
  END LOOP;
END $$;

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS death_lunar_year integer,
  ADD COLUMN IF NOT EXISTS death_lunar_month integer,
  ADD COLUMN IF NOT EXISTS death_lunar_day integer,
  ADD COLUMN email text,
  ADD COLUMN linked_user_id uuid,
  ADD UNIQUE (tree_id,id),
  ADD UNIQUE (tree_id,email),
  ADD UNIQUE (tree_id,linked_user_id);
ALTER TABLE relationships
  ADD FOREIGN KEY (tree_id,person_a) REFERENCES persons(tree_id,id) ON DELETE CASCADE,
  ADD FOREIGN KEY (tree_id,person_b) REFERENCES persons(tree_id,id) ON DELETE CASCADE;
ALTER TABLE person_details_private
  ADD FOREIGN KEY (tree_id,person_id) REFERENCES persons(tree_id,id) ON DELETE CASCADE;
CREATE INDEX relationships_tree ON relationships(tree_id);
CREATE INDEX private_details_tree ON person_details_private(tree_id);
CREATE INDEX events_tree ON custom_events(tree_id);
CREATE INDEX gallery_tree ON gallery_items(tree_id);

-- Write the same parent row for competing removals. A waiter at READ COMMITTED
-- sees the winner's membership changes; stronger isolation aborts stale writers.
CREATE FUNCTION public.require_tree_owner() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  affected_tree uuid;
BEGIN
  IF TG_TABLE_NAME='family_trees' THEN
    affected_tree := NEW.id;
  ELSE
    affected_tree := OLD.tree_id;
  END IF;
  UPDATE public.family_trees SET updated_at=updated_at WHERE id=affected_tree;
  IF FOUND AND NOT EXISTS (SELECT FROM public.tree_memberships WHERE tree_id=affected_tree AND role='owner') THEN
    RAISE EXCEPTION 'A Family Tree must retain an Owner' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tree_retains_owner AFTER DELETE OR UPDATE ON tree_memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.role='owner')
  EXECUTE FUNCTION require_tree_owner();

\set count_prefix after_
\ir ../../scripts/verify-multi-family-migration.sql
\unset count_prefix
SELECT :'before_snapshot'::jsonb = :'after_snapshot'::jsonb AS snapshot_matches \gset
\if :snapshot_matches
\else
DO $$ BEGIN RAISE EXCEPTION 'Legacy row counts or access mappings changed during migration'; END $$;
\endif
INSERT INTO schema_migrations(version) VALUES ('20261119100000');
\endif

-- Also harden a database stamped by the original pre-release rehearsal. The
-- constraints and backfill commit together on a first installation.
SELECT NOT EXISTS (SELECT FROM schema_migrations WHERE version='20261119100500') AS harden \gset
\if :harden
LOCK TABLE family_trees, tree_memberships, persons, users IN ACCESS EXCLUSIVE MODE;
\ir ../../scripts/email-normalization.sql
DROP INDEX IF EXISTS public.users_normalized_email;
CREATE FUNCTION public.normalize_email(email text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE RETURN :normalize_email_sql;
CREATE UNIQUE INDEX users_normalized_email ON users(public.normalize_email(email));
ALTER TABLE persons
  DROP CONSTRAINT IF EXISTS persons_email_check,
  ADD CONSTRAINT persons_email_check CHECK (email <> '' AND email=public.normalize_email(email)),
  DROP CONSTRAINT IF EXISTS persons_tree_id_linked_user_id_fkey,
  ADD FOREIGN KEY (tree_id,linked_user_id) REFERENCES tree_memberships(tree_id,user_id);
CREATE FUNCTION public.require_explicit_person_unlink() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Explicitly unlink the Person before assigning another System User' USING ERRCODE='23514';
END $$;
CREATE TRIGGER person_link_requires_unlink BEFORE UPDATE OF linked_user_id ON persons
  FOR EACH ROW WHEN (OLD.linked_user_id IS NOT NULL AND NEW.linked_user_id IS NOT NULL
                     AND OLD.linked_user_id <> NEW.linked_user_id)
  EXECUTE FUNCTION public.require_explicit_person_unlink();

DO $$ BEGIN
  IF EXISTS (SELECT FROM family_trees t WHERE NOT EXISTS
               (SELECT FROM tree_memberships m WHERE m.tree_id=t.id AND m.role='owner')) THEN
    RAISE EXCEPTION 'A Family Tree must retain an Owner';
  END IF;
END $$;
DROP TRIGGER IF EXISTS tree_requires_first_owner ON family_trees;
CREATE CONSTRAINT TRIGGER tree_requires_first_owner AFTER INSERT OR UPDATE OF id ON family_trees
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_tree_owner();
INSERT INTO schema_migrations(version) VALUES ('20261119100500');
\endif
COMMIT;
