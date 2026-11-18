# Multi-family Access, API, and MCP Design

**Status:** Approved in chat on 2026-11-19

## Goal

Allow each active System User to create and manage multiple independent Family Trees, then give trusted agents the same effective family-data capabilities as that user. One generated bearer key authenticates both the REST API under `/api/v1` and the stateless MCP endpoint at `/api/mcp`.

## User and navigation changes

- Delete `/about` and every link to the project-introduction page.
- Remove public self-registration from `/login` and remove the public `signup` server action.
- Only an authenticated, active Super Admin can create, activate, suspend, or delete System Users.
- Every active System User can create multiple Family Trees and becomes Owner of each tree they create.
- Owners add existing users by exact normalized email; there is no account search, suggestion, mail delivery, invitation token, or pending invitation in this release.
- Each tree has `owner`, `editor`, and `viewer` memberships. The final Owner cannot leave, be removed, or be demoted.
- An Owner can link one Person to one System User in the same tree. Exact email may establish a missing link but can never replace an existing link silently.
- Add an administrator page at `/dashboard/api-keys` for creating, listing, and revoking API keys. A full secret is displayed exactly once after creation.
- All new tree switching, access management, and key-management screens are mobile-first: single-column forms at 320–430px, 44px minimum targets, safe-area-aware actions, wrapped secrets/emails, and no page-level horizontal overflow.

## Architecture

All browser actions, REST routes, and MCP tools resolve a validated Family Tree context and enforce the same membership rules. `FamilyService` owns transport-neutral API validation, authorization, SQL, and audit writes.

The MCP endpoint uses the official Web-standard `@modelcontextprotocol/server` handler in stateless mode. It accepts POST only. API keys are application credentials, not OAuth tokens.

## API-key security contract

- Key format: `gptree_<public-prefix>_<secret>` with at least 256 bits of random secret material.
- Store only `SHA-256(full key)` plus the non-secret public prefix. Never log or persist the full secret.
- Accept only `Authorization: Bearer <key>` over HTTPS.
- Optional expiration; revoked or expired keys fail with HTTP 401.
- Scopes: `read`, `write`, `private`, `delete`.
- `write` does not imply `delete`; private person details additionally require `private`.
- Keys belong to a System User, not a Family Tree. Each request supplies a tree ID and re-checks the key owner's current membership; a removed or demoted user loses the corresponding key capability immediately.
- Key creation and revocation require an authenticated active user for their own keys; Super Admin status does not grant implicit API access to unrelated trees.
- Mutations create audit records without request bodies, secrets, passwords, or private field values.
- MCP validates Host and Origin against configured application origins before authentication.

## Data model

Add `family_trees`, `tree_memberships`, and tree-scoped foreign keys on every family record. Add optional normalized email and linked user ID to Person, with database uniqueness preventing one user from linking to multiple people in the same tree. Add `api_keys` with owner user ID, name, public prefix, token hash, scopes, expiry, last-use, revocation, and timestamps. Add `api_audit_logs` with key, user, tree, transport, action, resource, outcome, and timestamp.

Migration creates one deterministic legacy tree, backfills all current family data, maps existing `admin` profiles to Super Admin plus Owner, `editor` to editor, and `member` to viewer. Cross-tree relationship endpoints are rejected with composite database constraints. The production migration runs transactionally through the declared deployment migration path, aborts on normalized-email collisions or invalid legacy references, and ships preflight, backup, post-migration row-count/access verification, and rollback instructions.

## REST surface

- `GET, POST /api/v1/persons`
- `GET, PATCH, DELETE /api/v1/persons/:id`
- `GET, POST /api/v1/relationships`
- `DELETE /api/v1/relationships/:id`
- `GET, POST /api/v1/events`
- `PATCH, DELETE /api/v1/events/:id`
- `GET, POST /api/v1/gallery`
- `DELETE /api/v1/gallery/:id`
- `GET /api/v1/stats`
- `GET /api/v1/export`

Every route requires a `familyTreeId` path/query context that the authenticated user belongs to. All collection reads are bounded. Image bytes are not accepted as base64; gallery creation accepts a previously uploaded/application-owned URL.

## MCP tools

Expose equivalent bounded tools: `list_family_trees`, `list_people`, `get_person`, `create_person`, `update_person`, `delete_person`, `list_relationships`, `create_relationship`, `delete_relationship`, `list_events`, `create_event`, `update_event`, `delete_event`, `list_gallery`, `create_gallery_item`, `delete_gallery_item`, `get_family_stats`, and `export_family_data`. Every family-data tool takes `familyTreeId` and resolves the key owner's membership server-side.

Tool annotations describe read-only and destructive behavior but authorization is always enforced in `FamilyService`.

## Error and validation contract

REST uses JSON errors with a stable `code`, Vietnamese `message`, and request ID. Expected statuses are 400 invalid input, 401 missing/invalid key, 403 missing scope, 404 unknown resource, 409 relationship/data conflict, and 500 internal error. MCP returns protocol tool errors without exposing SQL or stack traces.

## Documentation surfaces

- Human guides: `docs/API.md` and `docs/MCP.md`.
- Machine-readable OpenAPI: `/api/openapi.json`.
- Agent discovery: `/llms.txt`.
- Internal schema and migration docs remain authoritative for operators.

## Verification

- Migration tests cover legacy backfill, role mapping, normalized-email collisions, cross-tree constraints, and final-owner protection.
- Authorization tests cover two trees, different per-tree roles, forged selected-tree cookies, exact-email add without enumeration, and Person Link uniqueness.
- Unit tests cover key generation/hash/parser, expiry/revocation, current membership, and scope combinations.
- Route/service tests cover authentication, bounded reads, CRUD, private-data isolation, and delete permission.
- MCP integration tests cover initialize/list/call, invalid credentials, missing scope, and destructive-tool denial.
- UI/auth tests prove `/about` and public registration are absent and user actions reject non-admin sessions.
- Responsive checks cover 320×568 and the canonical 430×932 mobile viewport, plus desktop expansion without a separate visual language.
- A production-shaped rehearsal proves the legacy data backfill preserves row counts, access mappings, and relationships before release.
- Run migration smoke test, unit suite, ESLint, TypeScript/build, and production route checks.

