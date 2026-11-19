BEGIN;
SET LOCAL lock_timeout='30s';
SELECT pg_advisory_xact_lock(20261119100000);
SELECT NOT EXISTS (SELECT FROM public.schema_migrations WHERE version='20261119112000') AS upgrade_generations \gset
\if :upgrade_generations
LOCK TABLE public.tree_media IN ACCESS EXCLUSIVE MODE;
-- All authentic pre-multi-tree records belonged to the deterministic legacy
-- tree. A copied reference provides no independent proof of bucket ownership.
DELETE FROM public.tree_media WHERE expected_bytes IS NULL
  AND tree_id<>'00000000-0000-0000-0000-000000000001';
ALTER TABLE public.tree_media ADD COLUMN logical_url text UNIQUE;
-- Preserve links and retries for objects previously issued by the scoped signer.
UPDATE public.tree_media SET logical_url=object_url WHERE expected_bytes IS NOT NULL;
INSERT INTO public.schema_migrations(version) VALUES ('20261119112000');
\endif
COMMIT;
