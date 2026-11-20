BEGIN;
SET LOCAL lock_timeout='30s';
SELECT pg_advisory_xact_lock(20261119100000);
SELECT NOT EXISTS (SELECT FROM public.schema_migrations WHERE version='20261119111000') AS upgrade_media \gset
\if :upgrade_media
LOCK TABLE public.persons,public.gallery_items IN SHARE MODE;
LOCK TABLE public.tree_media IN ACCESS EXCLUSIVE MODE;
\ir legacy-media-owners.sql
-- The first ledger did not record provenance. Drop unverifiable claims from
-- older installations without deleting a single bucket object or family row.
DELETE FROM public.tree_media m WHERE NOT EXISTS (
  SELECT FROM pg_temp.verified_legacy_media v WHERE (v.url,v.tree_id,v.folder)=(m.object_url,m.tree_id,m.folder)
);
ALTER TABLE public.tree_media ADD COLUMN cleanup_claim uuid,
  ADD COLUMN cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN expected_bytes integer;
INSERT INTO public.schema_migrations(version) VALUES ('20261119111000');
\endif
COMMIT;
