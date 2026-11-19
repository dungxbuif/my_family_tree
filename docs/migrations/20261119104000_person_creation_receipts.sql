BEGIN;
SELECT pg_advisory_xact_lock(20261119100000);
CREATE TABLE IF NOT EXISTS person_creation_receipts (
  tree_id uuid NOT NULL REFERENCES family_trees ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  fingerprint text NOT NULL,
  person_ids uuid[] NOT NULL,
  PRIMARY KEY(tree_id,user_id,submission_id)
);
INSERT INTO schema_migrations(version) VALUES('20261119104000') ON CONFLICT DO NOTHING;
COMMIT;
