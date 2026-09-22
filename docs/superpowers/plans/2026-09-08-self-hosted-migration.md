# Self-Hosted Family Tree Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Family Tree type-safe, self-hosted, production-deployable at `family.dungxbuif.com`, with PostgreSQL on Pi5 and the app on the Mac mini.

**Architecture:** Keep the existing Supabase-shaped query compatibility layer, but make its selection cardinality explicit to TypeScript. Make signup transactional, preserving the current session API. Package the Next app as a Mac-hosted Docker Compose service; Pi5 Caddy is the only TLS ingress and proxies to the Mac LAN port.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, PostgreSQL 16, Bun, Docker Compose, Caddy.

**Spec:** `docs/superpowers/specs/2026-09-08-self-hosted-migration-design.md`

## Global Constraints

- Production hostname is `family.dungxbuif.com`; Pi5 Caddy terminates TLS.
- Production application files live under `~/production/family-tree` on the Mac mini.
- PostgreSQL stays on Pi5; do not run a production database container beside the app.
- Preserve existing uncommitted migration changes and do not delete data or volumes.
- Keep the existing UI design unchanged.

---

### Task 1: Correct query-builder result cardinality

**Files:**
- Modify: `utils/db/table-client.ts`
- Modify: `app/dashboard/members/page.tsx`
- Test: TypeScript compile check

**Interfaces:**
- Produces: `QueryBuilder<T, TData>` where `select()` returns `QueryBuilder<T, T[]>` and `single()` returns `QueryBuilder<T, T | null>`.
- Consumes: all existing `getDataClient().from<T>()` callers.

- [ ] **Step 1: Record the failing type check**

Run: `npx tsc --noEmit`

Expected: errors showing `Person | never[]` and `Relationship | never[]` in collection consumers.

- [ ] **Step 2: Implement the minimal generic result model**

```ts
class QueryBuilder<T, TData = T[]> implements PromiseLike<QueryResponse<TData>> {
  select(columns = "*"): QueryBuilder<T, T[]> { /* ... */ }
  single(): QueryBuilder<T, T | null> { /* ... */ }
}
```

Keep SQL execution unchanged; only type result cardinality changes.

- [ ] **Step 3: Verify type check passes**

Run: `npx tsc --noEmit`

Expected: no TypeScript errors.

### Task 2: Make first-account signup atomic

**Files:**
- Modify: `utils/db/client.ts`
- Modify: `app/actions/auth.ts`
- Test: an integration script using the configured test database

**Interfaces:**
- Produces: `withTransaction<T>(callback: (client) => Promise<T>): Promise<T>` and transactional signup insertions.
- Consumes: `pg.Pool` and the existing password/session helpers.

- [ ] **Step 1: Add a test that demonstrates one first Admin under concurrent signup**

The test creates an isolated database/schema, concurrently creates two valid accounts through the signup persistence helper, then asserts exactly one `profiles.role = 'admin'` and exactly one active profile.

- [ ] **Step 2: Run it and confirm the current sequential query implementation cannot provide the transaction guarantee**

Run the focused test against an empty test database.

Expected: fail before implementation because there is no transaction helper/atomic signup path.

- [ ] **Step 3: Add transaction helper and lock-protected signup persistence**

```ts
await withTransaction(async (client) => {
  await client.query("SELECT pg_advisory_xact_lock($1)", [FIRST_ACCOUNT_LOCK]);
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users");
  // insert users and profiles through this same client
});
```

Create a session only after the transaction commits.

- [ ] **Step 4: Re-run the focused test**

Expected: exactly one active Admin, all inserts committed consistently.

### Task 3: Align Next production routing and local migration verification

**Files:**
- Modify: `middleware.ts` / rename to the supported Next 16 convention if required by installed version
- Modify: `scripts/test-local-dev-migration.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: the existing cookie guard and `docs/schema.sql`.
- Produces: a warning-free Next production build and a repeatable local migration verification command.

- [ ] **Step 1: Record build warnings and migration behavior**

Run: `npm run build` and `npm run test:local-dev`.

- [ ] **Step 2: Apply the smallest convention/configuration change**

Use the Next 16-supported proxy naming while retaining matcher behavior. Keep the migration test idempotent and make it assert all required tables and a write path.

- [ ] **Step 3: Verify local checks**

Run: `npm run lint`, `npm run build`, and `npm run test:local-dev`.

Expected: all commands exit zero; lint permits only the existing image-performance warnings if they remain.

### Task 4: Add Mac production deployment assets

**Files:**
- Create: `deployment/production/docker-compose.yml`
- Create: `deployment/production/.env.example`
- Create: `deployment/production/migrate.sh`
- Modify: `README.md`

**Interfaces:**
- Produces: a `family-tree` service bound to a dedicated Mac LAN port, persistent uploads bind mount, health check, and Pi5 `DATABASE_URL` configuration.
- Consumes: the existing `Dockerfile`, `docs/schema.sql`, and Pi5 PostgreSQL URL supplied in the production `.env`.

- [ ] **Step 1: Write a compose configuration validation command**

Run: `docker compose --env-file deployment/production/.env.example -f deployment/production/docker-compose.yml config`

Expected: fail until production assets exist.

- [ ] **Step 2: Add production compose and migration scripts**

The compose service must:

```yaml
ports: ["18085:3000"]
restart: unless-stopped
volumes: ["/Users/dungxbuif/production/family-tree/uploads:/app/uploads"]
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/login"]
```

`migrate.sh` must run `postgres:16-alpine psql` with `DATABASE_URL`, reading `docs/schema.sql`, without printing credentials.

- [ ] **Step 3: Validate compose rendering and image build**

Run the compose configuration check and `docker build -t homelab/family-tree:local .`.

Expected: rendered configuration has no database service and the image builds successfully.

### Task 5: Deploy and expose `family.dungxbuif.com`

**Files:**
- Create on Mac: `~/production/family-tree/` from Task 4 assets
- Modify on Pi5: `/ssd-data/infra/Caddyfile`

**Interfaces:**
- Consumes: verified Docker image, Pi5 database credentials, Mac LAN address, and existing Pi5 Caddy configuration.
- Produces: `https://family.dungxbuif.com` proxying to the Mac `:18085` app and a dedicated Family Tree database.

- [ ] **Step 1: Read-only preflight**

Verify Pi5 reachability, current Caddy configuration, PostgreSQL connectivity, DNS resolution, and that host port `18085` is unused.

- [ ] **Step 2: Create dedicated database and role**

Use Pi5 PostgreSQL with a unique role/database. Store the URL only in mode-600 production `.env`; do not echo it.

- [ ] **Step 3: Deploy app and run migration**

Copy only deployment assets and the built image/context to `~/production/family-tree`, run the production migration, then start the compose service.

- [ ] **Step 4: Add narrow Caddy host handler and reload**

```caddy
@family host family.dungxbuif.com
handle @family {
    reverse_proxy 10.10.0.10:18085
}
```

Back up the Pi5 Caddyfile first, validate it, hot-reload Caddy, and preserve all existing handlers.

- [ ] **Step 5: Run deployment smoke tests**

Verify local `http://localhost:18085/login`, LAN `http://10.10.0.10:18085/login`, public `https://family.dungxbuif.com/login`, and first-account signup/login/logout. Confirm uploaded avatar persists across an app-container restart.
