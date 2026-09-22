# Plan Review: Personal Self-Hosted Family Tree

Date: 2026-06-01
Scope: convert this project from public/open-source Gia Pha OS positioning to a private personal deployment, and remove dependency on third-party hosted services where practical.

## Current Findings

- The app is a Next.js 16 project using Supabase as the backend client, auth provider, database API, and storage API.
- There are no `app/api/**/route.ts` endpoints. Backend behavior is currently implemented through Supabase client calls and Next Server Actions in `app/actions/*`.
- `README.md` still positions the project as "Gia Phả OS (Gia Phả Open Source)", includes public demo credentials, Vercel deployment, Supabase cloud setup, contributing, license, and upstream branding.
- UI still contains public/upstream identity in `components/Footer.tsx`, `app/about/page.tsx`, `app/missing-db-config/page.tsx`, `app/setup/page.tsx`, demo-domain behavior, and Supabase-specific copy.
- Config and env are tightly coupled to Supabase cloud naming: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `demoDomain`, `exampleEmail`, `examplePassword`.
- Database schema uses Supabase-specific schemas/functions: `auth.users`, `auth.uid()`, `authenticated`, `storage.buckets`, `storage.objects`, and Supabase Auth implementation details in admin user creation.
- Gallery/avatar uploads are coupled to Supabase Storage buckets named `avatars` and `gallery`.
- `.github/FUNDING.yml` contains community/sponsorship metadata and should be removed for a personal/private repo.

## Target State

- The product reads as a private family-tree system, not a public open-source/community project.
- All deployment instructions target a self-hosted stack.
- Runtime services can be hosted on your own server/VPS/home lab without Supabase, Vercel, GitHub login, public demo, analytics, telemetry, sponsor/community metadata, or any third-party hosted backend.
- Sensitive configuration is explicit, local, and documented without exposing real secrets.
- UI copy explains personal ownership and private family data, without upstream links or public contribution prompts.

## Implemented Local Dev Baseline

Status: ready for review.

Files added or changed:

- `docker-compose.yml`
- `docs/local-dev-supabase-compat.sql`
- `scripts/wait-for-local-db.sh`
- `scripts/migrate-local-dev.sh`
- `scripts/test-local-dev-migration.sh`
- `package.json`
- `docs/schema.sql`
- `app/actions/data.ts`

What is implemented:

- A local PostgreSQL 16 Docker service named `db`, exposed on host port `55432`.
- A Supabase-compatibility SQL prelude for local development. It creates the minimum `auth` and `storage` schemas, roles, `auth.users`, `auth.uid()`, `auth.role()`, `storage.buckets`, and `storage.objects` needed for the existing schema to migrate on plain PostgreSQL.
- A local migration command that applies the compatibility layer and `docs/schema.sql` to the dev database.
- A migration test command that starts the Docker DB, waits for readiness, runs migration, and verifies key relations, auth/storage functions, policies, and insertability.
- `docs/schema.sql` is now idempotent for the local baseline paths that previously failed on repeat migration: editor policies, gallery table, gallery policies, and gallery storage policies.
- `app/actions/data.ts` now avoids `any` in export pagination so lint can pass.

Commands:

```bash
npm run dev:services
npm run dev:migrate
npm run test:local-dev
```

Local DB connection:

- Host: `localhost`
- Port: `55432`
- Database: `family_tree_dev`
- User: `postgres`
- Password: `postgres`

Verification run on 2026-06-01:

- `npm run test:local-dev` passed on a clean Docker volume.
- `npm run test:local-dev` passed again on the same existing Docker volume, proving repeat migration works for the local baseline.
- `npm run lint` passed with 0 errors. Remaining output is 3 existing `<img>` warnings in gallery upload/display components.
- `npm run build` passed after running outside the sandbox so Next.js could write `.next`.

Known boundary:

- This is a local development database container and migration harness, not the final architecture.
- The compatibility SQL is temporary. It exists only to run and inspect the current Supabase-shaped schema while migrating away from Supabase.
- The app still uses the Supabase client SDK today. That is now explicitly out of scope for the target state and must be removed.
- Do not build a self-hosted Supabase stack. Supabase remains a third-party platform dependency even when self-hosted because the app would still depend on Supabase Auth/API/Storage semantics and SDKs.

## Recommended Self-Hosted Architecture

Use this as the review baseline before implementation:

- App: Next.js container served by Docker Compose.
- Database: self-hosted PostgreSQL.
- Data access: server-side PostgreSQL client or ORM/query builder owned by the app, not Supabase SDK.
- Auth: app-owned email/password auth with server-side sessions and secure cookies.
- Storage: local filesystem first, with optional self-hosted MinIO later if object storage is needed.
- Reverse proxy/TLS: Caddy, Traefik, or Nginx Proxy Manager.
- Backups: scheduled PostgreSQL dump plus storage volume backup.

Decision: remove Supabase completely. No `@supabase/*` dependencies, no PostgREST requirement, no GoTrue/Auth service, no Supabase Storage API, no Supabase dashboard, no `auth.uid()`/`storage.objects` runtime dependency in the final schema.

## Phase 1: Personalize Public Identity

Files to review and update:

- `README.md`
- `app/config.ts`
- `app/layout.tsx`
- `app/about/page.tsx`
- `components/Footer.tsx`
- `public/site.webmanifest`
- `.github/FUNDING.yml`
- `package.json`
- `docs/seed.sql`

Tasks:

- Rename product from "Gia Phả OS / Gia Phả Open Source" to your personal family-tree name.
- Remove public demo section, demo credentials, public demo domain, contribution section, GitHub/Vercel badges, upstream icon URL, sponsor metadata, and HomieLab links.
- Replace "mã nguồn mở", "đóng góp", "issues", "pull requests", and public support language with private-family wording.
- Change footer from upstream project attribution to private deployment ownership or remove external links entirely.
- Remove demo-domain logic and demo account restrictions unless you still want a private staging/demo environment.
- Update manifest `name` and `short_name`.

Acceptance checks:

- `rg -n "homielab|giapha-os|Gia Phả OS|Open Source|mã nguồn mở|đóng góp|pull request|issues|Vercel|Demo|giaphaos@|ko_fi|github.com/homielab" .`
- Remaining hits must be intentionally retained, not accidental branding.

## Phase 2: Replace Cloud Deployment Docs With Self-Hosted Docs

Files to review and update:

- `README.md`
- `.env.example`
- `app/missing-db-config/page.tsx`
- `app/setup/page.tsx`
- new `docker-compose.yml`
- optional `docs/self-hosting.md`
- optional `docs/backup-restore.md`

Tasks:

- Remove Vercel deploy button and Supabase cloud dashboard setup instructions.
- Add Docker Compose instructions for app, database/auth/storage services, reverse proxy assumptions, and first-admin bootstrap.
- Replace Supabase Dashboard instructions in setup/missing-config UI with self-hosted admin/CLI instructions.
- Document backup and restore commands for PostgreSQL and uploaded files.
- Document local secret generation and where secrets are stored.

Acceptance checks:

- A fresh user can start the stack from docs without creating accounts on Supabase, Vercel, or GitHub.
- `.env.example` contains only placeholders and no public-hosted-service defaults.

## Phase 3: Config And Secrets Review

Files to review and update:

- `.env.example`
- `app/config.ts`
- `utils/supabase/client.ts`
- `utils/supabase/server.ts`
- `utils/supabase/middleware.ts`
- `proxy.ts`

Tasks:

- Rename environment variables away from Supabase:
  - `DATABASE_URL`
  - `AUTH_SECRET`
  - `APP_URL`
  - `UPLOAD_DIR`
  - optional `STORAGE_PUBLIC_BASE_URL`
- Add server-only secrets where needed, never `NEXT_PUBLIC_*` for privileged keys.
- Remove `EXAMPLE_EMAIL`, `EXAMPLE_PASSWORD`, and `DEMO_DOMAIN` unless a private staging mode is required.
- Fail loudly on invalid required config in server paths, while keeping a friendly setup page for the UI.
- Ensure `.gitignore` excludes `.env`, `.env.local`, dumps, uploaded files, and local volumes.

Acceptance checks:

- No real secrets are present in repo: `rg -n "password|secret|service_role|jwt|token|apikey|api_key|PRIVATE|BEGIN .*KEY" .`
- Client-visible env only contains values that are safe to expose.

## Phase 4: Remove Supabase Runtime Completely

Files to review and update:

- `utils/supabase/*`
- `components/UserProvider.tsx`
- `app/login/page.tsx`
- `app/actions/user.ts`
- `app/actions/member.ts`
- `app/actions/data.ts`
- `components/MemberForm.tsx`
- `components/modal/UploadModal.tsx`
- `components/GalleryGrid.tsx`
- `docs/schema.sql`
- `docs/migrations/*.sql`
- `package.json`
- `bun.lock`
- new server-side DB/auth/storage modules

Tasks:

- Remove `@supabase/ssr` and `@supabase/supabase-js` from dependencies.
- Replace `utils/supabase/*` with app-owned modules:
  - `utils/db/*` for PostgreSQL connection/query helpers.
  - `utils/auth/*` for password hashing, login, logout, current session, and role checks.
  - `utils/storage/*` for avatar/gallery upload, delete, and URL resolution.
- Replace Supabase Auth with application-owned tables:
  - `app_users` or `users`
  - `sessions`
  - `profiles` linked to the app-owned user table, not `auth.users`
- Replace Supabase RLS-dependent authorization with server-side authorization in Server Actions and route handlers.
- Replace Supabase Storage buckets with local filesystem storage under an ignored upload directory.
- Replace `.from()`, `.rpc()`, `.auth.*`, and `.storage.*` usages throughout the app.
- Rewrite admin user functions currently implemented as Postgres RPC/Supabase Auth mutations into server actions backed by app-owned tables.
- Remove final runtime dependency on `auth.uid()`, `auth.role()`, `authenticated`, `storage.buckets`, and `storage.objects`.
- Keep the local compatibility migration only as a temporary reference until the new first-party schema is written, then delete it.

Acceptance checks:

- `rg -n "@supabase|Supabase|supabase|auth\\.uid|auth\\.role|storage\\.objects|storage\\.buckets|NEXT_PUBLIC_SUPABASE" app components utils docs package.json bun.lock` returns no runtime dependency hits. Historical migration notes may remain only if clearly marked obsolete.
- Login/signup, first admin creation, member CRUD, relationship CRUD, user management, import/export, gallery upload/delete, and avatar upload/delete all work without Supabase services or SDKs.
- The app can run with only the app container, PostgreSQL container, and local upload volume.
- No code path requires `supabase.com`, hosted project URL, Supabase dashboard, PostgREST, GoTrue, or Supabase Storage API.

## Phase 5: API And Server Action Review

Files to review and update:

- `app/actions/user.ts`
- `app/actions/member.ts`
- `app/actions/data.ts`
- pages under `app/dashboard/**`
- client components that call Supabase directly

Tasks:

- Inventory every data access path currently calling `.from()`, `.rpc()`, `.auth`, or `.storage`.
- Move privileged operations out of client components where possible.
- Standardize authorization checks in server actions.
- Define stable error handling for database unavailable, storage unavailable, unauthenticated, inactive user, and insufficient role.
- Confirm import/export cannot bypass role rules or delete unintended data.

Acceptance checks:

- There are no remaining client-side database calls.
- Client code does not contain privileged database/storage operations.
- Admin-only actions are enforced server-side.
- No public API routes exist unintentionally; if added later, they require auth and role checks.

## Phase 6: UI Copy And Personal Privacy Review

Files to review and update:

- `app/about/page.tsx`
- `app/login/page.tsx`
- `app/missing-db-config/page.tsx`
- `app/setup/page.tsx`
- `components/Footer.tsx`
- `components/AdminUserList.tsx`
- `components/Footer.tsx`

Tasks:

- Replace public demo warnings with private deployment wording.
- Remove "góp ý", public email, public project support, and upstream attribution.
- Ensure privacy copy says data stays on the owner-controlled server and PostgreSQL/upload volumes, not "Supabase của chính bạn".
- Update setup screens to point to local setup commands or an internal admin page.

Acceptance checks:

- UI has no external community/contact/demo links.
- User-facing setup copy matches the actual self-hosted stack.

## Phase 7: Flexible Family Graph Creation

Goal: users can start a family tree from any known member, then connect that member to parents, children, spouses, siblings, or other relatives later. The system must support "create cháu first, then connect upward to parents/grandparents/other nodes" instead of requiring a root ancestor before data entry.

Files to review and update:

- `types/index.ts`
- `docs/schema.sql`
- `docs/migrations/*.sql`
- `components/MemberForm.tsx`
- `components/RelationshipManager.tsx`
- `components/FamilyTree.tsx`
- `components/MindmapTree.tsx`
- `components/BubbleMapTree.tsx`
- `components/LineageManager.tsx`
- `components/RootSelector.tsx`
- `components/PersonSelector.tsx`
- `utils/treeHelpers.ts`
- `utils/kinshipHelpers.ts`
- `app/dashboard/members/new/page.tsx`
- `app/dashboard/members/[id]/edit/page.tsx`
- `app/dashboard/lineage/page.tsx`
- `app/dashboard/kinship/page.tsx`

Tasks:

- Treat family data as a graph of `persons` and `relationships`, not as a tree that must start from one root.
- Allow creating a standalone person with no relationships.
- Add relationship creation flows from any selected person:
  - add parent above this person
  - add child below this person
  - add spouse/partner beside this person
  - connect to an existing person as parent, child, spouse, or adopted child
- Support the concrete workflow: create the user as a grandchild first, then connect that user upward to parent nodes, then connect those parent nodes to grandparent/ancestor nodes.
- Make root selection a display concern only. A "root" controls the current view, not whether a person can exist or be connected.
- Add validation to prevent impossible or corrupt graph states:
  - no self-relationship
  - no duplicate relationship of the same type between the same two people
  - no direct parent-child cycle
  - warn before creating ambiguous duplicate parent links
  - preserve support for marriage, biological child, and adopted child relationships
- Make visual tree rendering resilient to partial graphs:
  - standalone nodes can be shown
  - orphan branches can be browsed
  - upward and downward traversal work from any selected person
  - disconnected clusters are discoverable from member search/root selector
- Update import/export so disconnected clusters and arbitrary start points round-trip correctly.
- Update kinship lookup to work even when the selected people are in a partial graph; show a clear "no known path" state instead of assuming bad data.

Suggested UI flow:

- On member detail: primary actions for "Add parent", "Add child", "Add spouse", and "Connect existing".
- In relationship manager: searchable person picker plus relationship direction selector.
- In tree/mindmap: "Focus on this person" action that redraws the graph around the selected node.
- In empty state: create the first known person, with copy explaining that they can be any family member.

Data model notes:

- Existing `relationships` table already supports graph-style links through `person_a`, `person_b`, and `type`; the implementation should first verify whether current semantics are enough before adding new tables.
- If direction is currently implicit or inconsistent, document and enforce canonical direction:
  - `biological_child`: `person_a` is parent, `person_b` is child
  - `adopted_child`: `person_a` is parent, `person_b` is child
  - `marriage`: unordered pair, normalized to avoid duplicate reverse rows
- If sibling/cousin/other relationship types are requested later, defer them unless they can be derived from parent-child links.

Acceptance checks:

- User can create a standalone "cháu" profile with no root ancestor.
- User can add or connect the cháu's parent after creation.
- User can add or connect grandparents after parent creation.
- User can connect two existing nodes without recreating either node.
- Tree, mindmap, lineage, member list, and kinship pages do not crash with disconnected or partial graph data.
- Export/import preserves standalone persons and disconnected clusters.
- Relationship validation prevents self-links, duplicate links, and simple cycles.

## Phase 8: Verification Checklist

Run after implementation:

```bash
bun install
bun run lint
bun run build
rg -n "homielab|giapha-os|Gia Phả OS|Open Source|mã nguồn mở|đóng góp|pull request|issues|Vercel|Supabase Dashboard|supabase.com|vercel.com|giaphaos@|ko_fi|github.com/homielab" .
rg -n "NEXT_PUBLIC_.*SECRET|SERVICE_ROLE|PRIVATE_KEY|BEGIN .*KEY|password=.*[^example]|token=.*[^example]" .
```

Manual UAT:

- Start from a clean self-hosted environment.
- Create first admin user.
- Create and edit family members.
- Create a standalone member without any root ancestor.
- Connect that member upward to parent and grandparent nodes.
- Connect two existing members with a new relationship.
- Switch tree/mindmap focus to different members in different branches.
- Upload avatar.
- Upload gallery image.
- Create relationship.
- Create custom event.
- Export and import data.
- Create editor/member users and verify role restrictions.
- Restart the stack and verify sessions/data/uploads persist.
- Restore from backup into a fresh stack.

## Open Decisions Before Implementation

1. Product name: what should replace "Gia Phả OS" across UI/docs/package metadata?
2. Backend strategy: locked to full removal of Supabase SDK and Supabase runtime services.
3. Storage strategy: default to local filesystem; decide later only if self-hosted MinIO is worth the extra operational cost.
4. Auth strategy: locked to app-owned auth/session tables unless a non-Supabase self-hosted IdP is explicitly chosen later.
5. Deployment target: one VPS, home server, NAS, or Kubernetes/Compose host?
6. Relationship UX: should "connect existing" be available everywhere from member detail, or only inside the relationship manager?
7. Graph validation strictness: should the app block cycles completely, or allow advanced admin override for unusual/incorrect historical data?
