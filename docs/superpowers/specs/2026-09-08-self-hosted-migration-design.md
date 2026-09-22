# Self-Hosted Migration Design

## Goal

Finish the migration from Supabase to self-hosted PostgreSQL, filesystem uploads, and application-managed sessions so the app can be deployed to `family.dungxbuif.com` with the homelab production topology.

## Scope and acceptance criteria

A production deployment from the Mac mini's `~/production` directory, followed by the documented migration command, must provide:

- Registration of the first account as the only initial active Admin; concurrent registration cannot create two initial Admins.
- Login, logout, protected dashboard routing, and Admin activation/deactivation of later accounts.
- Create, read, update, and delete for people and relationships, including private details subject to existing role checks.
- Event, gallery, avatar upload, and safe serving of files from the mounted `uploads` volume.
- Data export and import using the existing formats.
- A production build with zero TypeScript errors, a passing lint command, and an idempotent database schema migration.

Out of scope: importing data from a live Supabase instance, email verification/reset, rate limiting, and a visual redesign.

## Architecture

`utils/db/table-client.ts` remains the compatibility layer for the existing Supabase-style query calls. Its public API must distinguish collection reads from singular reads: `select()` produces `QueryResponse<T[]>`, while `single()` narrows that same builder to `QueryResponse<T | null>`. This preserves call sites and makes the existing component expectations statically correct.

The application owns authentication. Signup will use a single PostgreSQL transaction with an advisory transaction lock for the first-account decision, then creates `users` and `profiles` atomically. A 30-day opaque, hashed session token remains in an HTTP-only cookie and is validated server-side. Middleware only performs the cheap token-present redirect; server actions and protected pages remain responsible for authorization.

The schema remains the idempotent source of truth. `scripts/migrate-local-dev.sh` continues to support the local database compose profile, while a production migration command connects to the dedicated Pi5 database using a short-lived PostgreSQL client container. The app's storage route validates the resolved path stays within `UPLOAD_DIR` before reading a file.

## Production deployment topology

The Family Tree image runs on the Mac mini in `~/production/family-tree`, exposing an uncommon LAN-only host port. Pi5 owns PostgreSQL and Caddy; Pi5 Caddy terminates TLS for `family.dungxbuif.com` and reverse-proxies HTTP to the Mac mini's LAN address and Family Tree host port. The app container receives a URL-encoded `DATABASE_URL` for the dedicated Family Tree database on Pi5 and a bind-mounted upload directory on the Mac mini.

The app does not publish a public port, run its own PostgreSQL container in production, or run Caddy locally. The existing project `docker-compose.yml` remains the local-development topology only. The production compose file follows the `~/production/mypocket` pattern: explicit image, `restart: unless-stopped`, health check, bridge network, and an `.env` file that is not committed.

## Deployment flow

1. Build the verified app image locally on the Mac mini.
2. Create the dedicated PostgreSQL database and minimally privileged application role on Pi5.
3. Write the production `.env` with the Pi5 database URL and the persistent Mac upload path.
4. Run the idempotent schema migration against the dedicated Pi5 database with a short-lived `postgres:16-alpine` client container, then start the Family Tree container.
5. Add the `family.dungxbuif.com` Caddy handler on Pi5, proxying to the Mac LAN port, reload Caddy, and verify TLS plus the app health endpoint.
6. Open `https://family.dungxbuif.com`, register the first account, then use the dashboard to create data and activate later accounts.

The README will state the exact commands and the smoke-test sequence. Migration verification creates disposable sample records with stable test identities and is safe to re-run.

## Error handling and security

- Database errors are returned to UI actions as existing Vietnamese user-facing messages and logged server-side.
- Signup rolls back completely when either user or profile insertion fails.
- Query helpers continue parameterizing values and allow-listing table and column identifiers.
- Upload URLs are accepted only beneath `/api/storage/`; resolved filesystem paths must remain beneath the configured upload root.
- The browser never receives a password hash or a raw session token through application data APIs.

## Validation strategy

Use test-first changes where runtime behavior changes. Add focused coverage for the query builder's collection/single semantics, signup's first-account transaction behavior, and migration/database invariants. Run `npx tsc --noEmit`, `npm run lint`, `npm run build`, the local Docker migration test, and a Docker Compose smoke test for the documented primary flows.

## Constraints

- Keep Next.js 16.2.6, Bun, PostgreSQL 16, and the existing React UI.
- Production hostname is `family.dungxbuif.com`; Pi5 Caddy is the only public TLS endpoint.
- Production app files live under `~/production/family-tree` on the Mac mini; Pi5 owns the database and Caddy configuration.
- Do not remove or overwrite user data, database volumes, or the existing uncommitted migration work.
- Do not introduce hosted services or external authentication providers.
- Do not redesign UI tokens; follow `DESIGN.md` for any necessary UI edits.
