-- Run with psql -X -v ON_ERROR_STOP=1 -f docs/schema.sql.
-- Relative includes keep fresh installs and upgrades on the same migration path.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(20261119100000);
SELECT to_regclass('public.users') IS NULL AS bootstrap \gset
\if :bootstrap
\ir migrations/00000000000000_legacy_schema.sql
\endif
COMMIT;
\ir migrations/20261119100000_add_family_trees.sql
\ir migrations/20261119102000_native_access_submissions.sql
\ir migrations/20261119103000_access_submission_claims.sql
\ir migrations/20261119104000_person_creation_receipts.sql
\ir migrations/20261119105000_unknown_person_life_status.sql
\ir migrations/20261119110000_tree_media.sql
\ir migrations/20261119111000_media_cleanup_claims.sql
