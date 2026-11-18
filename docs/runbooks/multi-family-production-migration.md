# Multi-family PostgreSQL cutover

The protected Family Tree receipt deploy job on VM100 runs the promoted digest’s
`/app/scripts/migrate-release.mjs` after its existing backup gate and before the
service update. The entry point uses `psql -X -v ON_ERROR_STOP=1` and the
service’s database connection. Deploy the companion ops change that accepts
`migration.enabled: true` before promoting the first multi-family image.
The first protected production tag must include the completed tree-context
authorization and tree-scoped family writes, including imports, exports and
private details. The protected-tag job `validate_tree_scope` runs
`scripts/verify-tree-scope.sh` against an ephemeral migrated PostgreSQL
database. It requires passing `utils/auth/tree-access.test.ts` and
`tests/tree-isolation.test.ts` at that same source commit. The image build
depends on this job, and ops promotion depends on the build. Keep the first
cutover on hold until both suites and the operator rehearsal below pass.
The application slug is `my-family-tree`, and the Swarm service is `family-tree`.

## Rehearse and capture a recovery point

Use PostgreSQL 16 or newer and a protected shell with libpq service profiles
for the production database, an empty rehearsal database, and an empty
recovery database. Set `PROD_SERVICE`, `REHEARSAL_SERVICE`, and
`RECOVERY_SERVICE` to their distinct service names. For the shell commands
below, start in the application checkout. Use an access-controlled backup
directory with capacity for a full logical backup. Retain the previous
immutable service specification and existing verified object/upload backups.

Before the final preflight and dump, stop background writers and place user
routes in maintenance mode. Keep the current Swarm task running. Permit
`GET /readyz` over public HTTPS from the protected ops runner throughout
cutover and allow the operator’s read-only SQL checks. At ingress, withhold
all other user traffic, including browser server actions, REST/MCP requests
and session mutations. Use an existing operator session for read-only
application verification through a restricted operator route. Confirm that
the ops runner can read `/readyz` while writes are paused. Ops checks
this route after updating the service.
Resume writers and general traffic after the service, database and access
checks succeed.

```sh
set -eu
umask 077
: "${PROD_SERVICE:?}" "${REHEARSAL_SERVICE:?}" "${RECOVERY_SERVICE:?}" "${BACKUP_DIR:?}"
test "$PROD_SERVICE" != "$REHEARSAL_SERVICE"
test "$PROD_SERVICE" != "$RECOVERY_SERVICE"
test "$REHEARSAL_SERVICE" != "$RECOVERY_SERVICE"
mkdir -p "$BACKUP_DIR"
snapshot=$(mktemp -d "$BACKUP_DIR/family-tree.XXXXXXXX")
PGSERVICE="$PROD_SERVICE" psql -XqAt -v ON_ERROR_STOP=1 -f scripts/preflight-multi-family-migration.sql > "$snapshot/before.json"
PGSERVICE="$PROD_SERVICE" pg_dump -Fc -f "$snapshot/legacy.dump"
PGSERVICE="$REHEARSAL_SERVICE" pg_restore --exit-on-error --single-transaction --no-owner --no-privileges -d "service=$REHEARSAL_SERVICE" "$snapshot/legacy.dump"
PGSERVICE="$REHEARSAL_SERVICE" psql -X -v ON_ERROR_STOP=1 -f docs/schema.sql
PGSERVICE="$REHEARSAL_SERVICE" psql -XqAt -v ON_ERROR_STOP=1 -f scripts/verify-multi-family-migration.sql > "$snapshot/rehearsal.json"
diff -u "$snapshot/before.json" "$snapshot/rehearsal.json"
```

Preflight rejects duplicate trim/lower System User emails, invalid account
or family references, and populated databases lacking a legacy admin.
Resolve the reported condition in the source with the data owner and repeat
the preflight, backup and rehearsal. The SQL runs those checks again under a
write lock. Source email spelling and existing row timestamps are preserved.
The email constraint and the unique System User email index use
`public.normalize_email(text)`, which removes the surrounding Unicode
whitespace accepted by JavaScript `String.trim()` and lowercases the result.
Use `public.normalize_email(users.email) = public.normalize_email($1)` for
exact account lookup.

## Release and verify

Promote the approved immutable image through the existing protected release
tag. The receipt deploy job uses the promoted digest, the running task network
and only its database setting to run the migration. A failed check rolls the
SQL transaction back and prevents service update. The recorded migration
version makes retries safe after an interrupted receipt, including after
subsequent intentional membership changes.

The first successful migration assigns all pre-existing family records to
`00000000-0000-0000-0000-000000000001`. Legacy admins become Super Admins
and Owners, editors become Editors, and members become Viewers. Inactive
accounts keep their inactive status. A fresh database starts with zero trees.

Before re-enabling writes, compare the migrated counts and per-user access snapshot with
the preflight snapshot and exercise the updated application as an existing user.

```sh
PGSERVICE="$PROD_SERVICE" psql -XqAt -v ON_ERROR_STOP=1 -f scripts/verify-multi-family-migration.sql > "$snapshot/after.json"
diff -u "$snapshot/before.json" "$snapshot/after.json"
```

Each snapshot contains row counts and a user-ID-ordered access list with
tree ID, owner/editor/viewer role, Super Admin status and account activation.
Preflight derives expected access from legacy profiles. Verification reads
the migrated flags and memberships. The two `diff` commands require an exact
match for every user. Keep these files in the protected backup directory.
The verification SQL also checks legacy tree count and tree assignment. Run this one-time check during cutover while original
memberships and counts are expected to match. Later releases use the migration
ledger. The release also verifies the running digest, readiness, DB and object
storage through the existing ops checks.

## Roll back

If the migration transaction failed, keep writes paused and inspect the
credential-free failure and the database migration ledger before retrying.
If the transaction committed and the release must revert, keep user writes and
background writers paused while maintaining the readiness and operator routes. Swarm restores a service specification only.
Recover the legacy database into the separate empty recovery database and
verify its counts before routing the old service to it.

```sh
PGSERVICE="$RECOVERY_SERVICE" pg_restore --exit-on-error --single-transaction --no-owner --no-privileges -d "service=$RECOVERY_SERVICE" "$snapshot/legacy.dump"
PGSERVICE="$RECOVERY_SERVICE" psql -XqAt -v ON_ERROR_STOP=1 -f scripts/preflight-multi-family-migration.sql > "$snapshot/recovery.json"
diff -u "$snapshot/before.json" "$snapshot/recovery.json"
```

Restore the production database ownership and grants appropriate to the
runtime identity, point the previous service specification at the verified
recovery database through the protected ops configuration, and verify its
legacy sign-in, family reads, readiness and object access before restoring
traffic. Preserve the migrated database for investigation. If new writes were
accepted after cutover, capture that database and reconcile those writes before
selecting a recovery point.
