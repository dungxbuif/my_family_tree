BEGIN;
SET LOCAL lock_timeout='30s';
SELECT pg_advisory_xact_lock(20261119100000);
SELECT NOT EXISTS (SELECT FROM public.schema_migrations WHERE version='20261119120000') AS add_api_keys \gset
\if :add_api_keys
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  public_prefix text NOT NULL UNIQUE CHECK (public_prefix ~ '^[0-9a-f]{24}$'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 4 AND
    array_position(scopes,NULL) IS NULL AND scopes <@ ARRAY['read','write','private','delete']),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_user_created ON public.api_keys(user_id,created_at DESC);
CREATE TRIGGER tr_api_keys_updated BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
-- Historical identifiers intentionally survive deletion of accounts, trees and keys.
CREATE TABLE public.api_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tree_id uuid,
  transport text NOT NULL CHECK (transport IN ('account','rest','mcp')),
  action text NOT NULL,
  resource_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('success','denied','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX api_audit_logs_key_time ON public.api_audit_logs(key_id,created_at);
INSERT INTO public.schema_migrations(version) VALUES('20261119120000');
\endif
COMMIT;
