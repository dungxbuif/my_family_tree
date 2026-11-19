BEGIN;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(20261119100000);
CREATE TABLE IF NOT EXISTS public.native_access_submissions (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  draft jsonb NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, id)
);
CREATE INDEX IF NOT EXISTS native_access_submissions_expiry ON public.native_access_submissions(expires_at);
INSERT INTO public.schema_migrations(version) VALUES ('20261119102000') ON CONFLICT DO NOTHING;
COMMIT;
