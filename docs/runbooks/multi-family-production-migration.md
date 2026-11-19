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
database, running application, local HTTPS ingress and private S3 test bucket. Every test in each of the six suites must run and pass at that source commit.

- `utils/auth/tree-access.test.ts` checks current Tree Membership.
- `tests/tree-isolation.test.ts` checks Person, private details and Relationship operations.
- `tests/secondary-tree-isolation.test.ts` checks Events, Gallery and Storage.
- `tests/data-tools-isolation.test.ts` checks backup, restore, media ownership, rollback, statistics, lineage and kinship. [Tree backup format and restore procedure](family-tree-backup.md)
- `tests/agent-rest.test.ts` checks key lifecycle, authentication, scopes, role changes and audited person operations.
- `tests/agent-mcp.test.ts` checks the official Streamable HTTP client, all 18 tools, secondary REST routes, revocation and bounded results.

The image build
depends on this job, and ops promotion depends on the build. Keep the first
cutover on hold until all six suites and the operator rehearsal below pass.
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
PGSERVICE="$REHEARSAL_SERVICE" psql -X -v ON_ERROR_STOP=1 -f docs/schema.sql
PGSERVICE="$REHEARSAL_SERVICE" psql -XqAt -v ON_ERROR_STOP=1 -f scripts/verify-multi-family-migration.sql > "$snapshot/retry.json"
diff -u "$snapshot/before.json" "$snapshot/retry.json"
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

### PostgreSQL 16 rehearsal on 2026-11-19

`bun test tests/multi-family-migration.test.ts -t 'cutover, retry'` ran against
PostgreSQL 16.15 with the legacy schema and synthetic data. A custom-format
dump was restored into two empty databases. The first received the entire
release schema twice. The second retained the restored legacy schema.
Preflight, first migration, retry and recovery agreed on these counts.

| Users | Profiles | Sessions | Persons | Relationships | Private details | Events | Gallery items |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 3 | 1 | 3 | 3 | 1 | 1 | 1 |

In legacy tree `00000000-0000-0000-0000-000000000001`, the active admin
mapped to active Owner and Super Admin, the active editor to active Editor,
and the inactive member to inactive Viewer. The three sorted relationship
UUIDs ended in 001, 002 and 003, respectively. They preserved the biological
edge from person 001 to 003, the marriage between 001 and 002, and the
adoptive edge from 002 to 003. The rehearsal compares the complete UUIDs,
type and ordered endpoints of each edge at every stage.

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

Each snapshot contains row counts, every relationship ordered by ID with its
type and both endpoint IDs, and a user-ID-ordered access list with
tree ID, owner/editor/viewer role, Super Admin status and account activation.
Preflight derives expected access from legacy profiles. Verification reads
the migrated flags and memberships. Each comparison requires an exact match.
Keep these files in the protected backup directory.
The verification SQL also checks legacy tree count and tree assignment. Run this one-time check during cutover while original
memberships and counts are expected to match. Later releases use the migration
ledger. The release also verifies the running digest, readiness, DB and object
storage through the existing ops checks.

Confirm the running service has `MCP_ALLOWED_ORIGINS` set to its canonical
public HTTPS origin. From the restricted operator route, read
`/api/openapi.json` and `/llms.txt` anonymously and verify that family data
requires authentication. Check the existing browser sessions against the
captured access expectations. On the first cutover, issue an operator key
once credential writes reopen. Supply it through the secret manager and
list the accessible trees through REST and MCP. Read a known record in the
selected tree, revoke the temporary key, and confirm a subsequent call
returns 401. Keep headers and private results out of the release log.

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

## Media ownership at cutover

Keep the bucket private. Migration `20261119110000` adopts references claimed exclusively by the deterministic legacy tree and matching the old signer's UUIDv4 image names or 64-character lowercase digest avatar names, under `avatars/` or `gallery/` with an empty or literal `family-tree/` prefix. Claims from another tree, multiple claims, external URLs and unrecognized paths retain their original metadata for operator review. The Gallery shows an unavailable-image placeholder. An Owner or Editor can replace the image through a verified upload or delete the metadata.

Migration `20261119111000` removes unverified claims from installations that ran the earlier preview migration. Preview-era scoped keys have no durable issuer provenance. The upgrade quarantines those rows, preserving the underlying private bucket objects and Gallery records. New objects record their signed size and durable cleanup state. Migration `20261119112000` also removes prior automatic claims in other trees and preserves independently issued object URLs. To identify Gallery records requiring repair, run:

```sql
SELECT g.tree_id,g.id,g.title FROM gallery_items g
LEFT JOIN tree_media m ON m.tree_id=g.tree_id AND m.object_url=g.image_url AND m.folder='gallery'
WHERE m.object_url IS NULL;
```


Invalidate existing CDN/proxy caches for `/api/storage/*` at cutover. Previously distributed immutable responses may remain in browser caches until their original expiry. New reads require the active account's current Tree Membership and selected tree and return `private, no-store`.

New uploads receive five-minute, checksum-bound PUT URLs. An image becomes readable when its tree attaches it to a Person or Gallery item. Removing the final reference makes the proxy deny reads immediately. A 24-hour grace period from the latest signature protects in-flight uploads and retries. Upload traffic collects expired unreferenced objects in the current tree. To reclaim storage for idle or deleted trees, run the following maintenance command with the application's database and bucket credentials. Each deletion gets an independent database claim. Bucket I/O runs outside the transaction and has a 15-second deadline. A failed deletion records its retry count and yields to other objects for five minutes. A worker can reclaim an abandoned claim after ten minutes. Repeated signatures reuse the live physical key. Once cleanup finalizes, another upload for the same submission receives a new physical key. A delayed delete can only reach the retired key.

```sh
bun /app/scripts/prune-tree-media.js
```

### Rehearse Gallery and Event access

Use a disposable migrated database and private test bucket. Start the application with the same database and S3 settings as the test process. Configure the bucket's CORS rules to allow the browser application's exact origin, method PUT, and the Content-Type request header. Set `FAMILY_TREE_TEST_DATABASE_URL`, `FAMILY_TREE_TEST_APP_URL`, `DATABASE_URL`, and the S3 variables. Use `.next/server/server-reference-manifest.json` for `FAMILY_TREE_TEST_ACTION_MANIFEST` with a production build.

```sh
FAMILY_TREE_TEST_LIVE_S3=1 bun test tests/secondary-tree-isolation.test.ts
bun scripts/test-secondary-browser.mjs
```

The browser rehearsal creates temporary Editor and Viewer memberships, exercises 320×568, 430×932 and 1280×800 with Chrome, and removes its accounts and trees. Its detached image objects expire under the same cleanup policy as application uploads.
