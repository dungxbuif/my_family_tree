# Multi-family Access, REST API, and MCP

**Status:** ready-for-agent

## Problem Statement

The application stores one global family tree, so a System User cannot create or participate in multiple independent Family Trees. Global profile roles blur account administration with family-data access, public registration allows uncontrolled account creation, and family operations are not isolated by tree. Users also have to enter family data manually because there is no safe REST or MCP surface for trusted agents.

## Solution

Introduce independently owned Family Trees with owner, editor, and viewer Tree Memberships. Super Admins alone manage System User accounts; public registration is removed. An Owner adds an existing active System User by entering their complete email without account search, and may link that account one-to-one with a Person in the tree. All browser, REST, MCP, import/export, private-data, and storage operations enforce the current Family Tree and Tree Membership.

Each Agent Credential belongs to a System User. REST and MCP authenticate as that user and re-evaluate current membership for the requested Family Tree on every call, so credentials cannot retain stale or elevated access. The production migration creates one deterministic legacy Family Tree and preserves all existing family data and effective roles.

## User Stories

1. As an active System User, I want to create multiple Family Trees, so that I can manage distinct family histories independently.
2. As a Family Tree creator, I want to become its Owner automatically, so that the tree is never left unmanaged.
3. As a System User, I want to switch between Family Trees I belong to, so that I only see the selected tree's data.
4. As a mobile user, I want the tree switcher to work comfortably on a 320px screen, so that switching trees does not require desktop layout.
5. As an Owner, I want to add an existing user by exact email, so that I can grant access without exposing an account directory.
6. As an Owner, I want a generic not-found response for unknown emails, so that the feature does not become an email enumeration endpoint.
7. As an Owner, I want to assign owner, editor, or viewer access, so that users receive only the permissions they need.
8. As an Owner, I want to promote another member to Owner, so that ownership can be shared or transferred.
9. As the final Owner, I want the system to prevent my removal or demotion, so that the Family Tree cannot become ownerless.
10. As an Editor, I want to maintain people, relationships, events, and gallery data in my Family Tree, so that I can help curate it.
11. As a Viewer, I want to read family data without mutation controls, so that I cannot accidentally change records.
12. As a user with roles in several trees, I want each role evaluated independently, so that editor access in one tree does not elevate me in another.
13. As a Super Admin, I want to create, activate, suspend, and delete System Users, so that account lifecycle remains centrally controlled.
14. As a normal user, I want account-administration operations denied server-side, so that hiding UI is not the only protection.
15. As an unauthenticated visitor, I want only the login form, so that public registration is unavailable.
16. As an Owner, I want to link a Person to an existing System User by exact email, so that a genealogical identity can correspond to an account.
17. As an Owner, I want linking an unjoined account to add viewer membership automatically, so that the linked user can access the tree.
18. As an Owner, I want one Person linked to at most one System User and one System User linked to at most one Person per tree, so that identity is unambiguous.
19. As an Owner, I want changing an unlinked Person's email to an existing account email to establish the link automatically, so that routine data entry can complete the association.
20. As a linked user, I want later email changes not to transfer my Person Link, so that identity cannot be silently taken over.
21. As an Owner, I want an existing Person Link to require explicit unlinking before reassignment, so that updates cannot replace it accidentally.
22. As a user, I want imported, exported, private, uploaded, and gallery data scoped to the selected Family Tree, so that no secondary feature leaks another tree.
23. As a user, I want cross-tree relationships rejected, so that one tree cannot reference another tree's Person records.
24. As a production operator, I want the existing single-tree data backfilled into one legacy Family Tree, so that the upgrade does not lose data.
25. As a production operator, I want migration preflight and verification checks, so that collisions and invalid references fail safely before deployment.
26. As a production operator, I want migration backup and rollback instructions, so that an unsuccessful release can be recovered.
27. As a System User, I want to create and revoke my own Agent Credentials, so that I can control agent access without sharing my password.
28. As a System User, I want an Agent Credential secret shown only once, so that plaintext credentials are never stored by the application.
29. As a System User, I want an Agent Credential to lose access immediately when my membership is removed or my account is suspended, so that credentials cannot preserve stale rights.
30. As an API client, I want bounded REST endpoints with stable errors, so that automation is predictable and cannot request unbounded datasets.
31. As an MCP client, I want to list accessible Family Trees, so that I can select a valid tree without guessing identifiers.
32. As an MCP client, I want family-data tools to use the same permissions as the owning user, so that MCP cannot bypass browser rules.
33. As a privacy-conscious user, I want private Person details to require explicit private access in addition to write/read permission, so that sensitive data receives separate protection.
34. As an operator, I want API and MCP mutations audited without secrets or private payloads, so that changes are traceable without creating another data leak.
35. As a mobile user, I want exact-email, membership, and Agent Credential controls to wrap and remain tappable, so that long values do not overflow the screen.
36. As a desktop user, I want the same mobile-first components to expand naturally, so that the product retains one visual language.

## Implementation Decisions

- A System User, Person, Tree Membership, Super Admin, and Owner are distinct domain concepts as defined in the glossary.
- Global account state contains active/suspended status and Super Admin capability. Family-data access exists only through Tree Membership.
- Tree Membership roles are owner, editor, and viewer. Owner management uses transaction-safe last-owner protection.
- Every active System User may create multiple Family Trees and becomes Owner in the same transaction as tree creation.
- There is no user-directory search, autocomplete, mail delivery, invitation token, or pending invitation in this release.
- Owners add only existing active accounts by complete trim/lower-normalized email.
- Person email is normalized when present. Email can establish a missing Person Link but is not the durable identity key.
- Person Links persist by System User ID, remain stable after email changes, and never replace an existing link automatically.
- Linking a System User who lacks membership creates viewer membership; Owners may promote that membership separately.
- All family records belong to one Family Tree. Relationship foreign keys include tree identity so cross-tree edges fail at the database boundary.
- The selected-tree cookie is a user-interface hint, never authorization. The server validates membership on every operation.
- Existing data migrates to one deterministic legacy Family Tree. Existing admins become Super Admins and Owners, editors become editors, and members become viewers.
- The production migration is transactional, rerunnable, and aborts on normalized-email collisions or invalid legacy references. It includes preflight, row-count/access verification, backup, and rollback procedures.
- Browser actions, REST, and MCP share the same tree-scoped authorization and family application service instead of implementing separate business rules.
- Agent Credentials belong to System Users, store only a cryptographic hash and public prefix, and are individually scoped, expirable, and revocable.
- Effective agent access is the intersection of credential scopes, current account state, and current Tree Membership.
- REST uses bounded collections and stable JSON errors. MCP uses stateless Streamable HTTP, official Web-standard server tooling, bounded schemas, and safe tool errors.
- Image bytes are not transported as base64 through MCP; gallery operations reference application-owned uploaded URLs.
- All new UI follows the approved Heritage Modern tokens, supports 320–430px first, uses 44px minimum targets, respects safe areas, wraps long values, and introduces no page-level horizontal overflow.

## Testing Decisions

- Tests assert observable behavior at three high seams rather than duplicating internal implementation tests.
- PostgreSQL integration tests exercise the real migration and constraints: legacy backfill, role mapping, row-count preservation, reruns, collision/orphan rollback, Person Link uniqueness, final-owner protection, and cross-tree rejection.
- Shared application-service tests exercise tree isolation and permission intersections once for browser, REST, and MCP consumers: different roles in two trees, suspended users, removed memberships, private data, destructive operations, imports, exports, and audit metadata.
- Browser tests exercise create/switch/manage workflows and exact-email behavior at 320×568, 430×932, and desktop. They verify accessibility, target sizes, wrapping, safe areas, and absence of overflow.
- Transport integration tests verify REST status/error contracts and a real MCP client initialize/list/call flow without retesting domain behavior at a lower seam.
- Security-focused tests verify forged tree IDs, cross-tree object IDs, stale cookies, email enumeration attempts, plaintext-key absence, revoked/expired credentials, and immediate permission loss.
- Production migration rehearsal runs against a production-shaped database copy or fixture and records before/after counts and access mappings.

## Out of Scope

- Sending invitation emails or integrating an SMTP/email provider.
- Pending invitations, invite acceptance links, or public/invite-only self-registration.
- Account lookup, partial-email search, suggestions, or autocomplete.
- Automatic replacement of an existing Person Link.
- A System User linked to multiple Person records in the same Family Tree.
- Global Super Admin API/MCP bypass into Family Trees without membership.
- Base64 image transfer through MCP.
- A separate desktop visual system.

## Further Notes

- The current application is fully single-tree and several account mutations lack server-side authorization; migration must fix enforcement, not only add columns.
- The current import path deletes global data outside a transaction and must become transactional and tree-scoped.
- The current storage path is global and must be made tree-aware before multi-tree privacy is considered complete.
- The existing production deployment contract disables migrations, so the app release and operations validation/deployment configuration must change together before production rollout.
