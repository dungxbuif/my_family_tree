BEGIN;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(20261119100000);
-- Keep all recorded true/false values. New records can explicitly leave life status unknown.
ALTER TABLE public.persons ALTER COLUMN is_deceased DROP NOT NULL,
  ALTER COLUMN is_deceased DROP DEFAULT;
INSERT INTO public.schema_migrations(version) VALUES ('20261119105000') ON CONFLICT DO NOTHING;
COMMIT;
