BEGIN;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(20261119100000);
ALTER TABLE public.native_access_submissions
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS pending_until timestamptz,
  ADD COLUMN IF NOT EXISTS rejection text CHECK (rejection IN ('FORBIDDEN','UNAVAILABLE','LAST_OWNER','LINKED','CONFIRM'));
INSERT INTO public.schema_migrations(version) VALUES ('20261119103000') ON CONFLICT DO NOTHING;
COMMIT;
