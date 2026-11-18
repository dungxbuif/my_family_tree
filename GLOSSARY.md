# Gia phả

This context describes family trees, the people recorded in them, and the accounts permitted to view or maintain them.

## Language

**Family Tree**:
An independently owned collection of people, relationships, events, and gallery items.
_Avoid_: Tenant, workspace, global tree

**System User**:
An authenticated account that may belong to multiple Family Trees.
_Avoid_: Member, person

**Super Admin**:
A System User allowed to create, activate, suspend, and delete System Users across the application.
_Avoid_: Tree owner, family admin

**Tree Membership**:
The association granting a System User an owner, editor, or viewer role in one Family Tree.
_Avoid_: Global role, account role

**Owner**:
A Tree Membership role responsible for access, lifecycle, and ownership of one Family Tree.
_Avoid_: Super admin, global admin

**Person**:
A genealogical record inside one Family Tree; it is not an authenticated account.
_Avoid_: User, account

**Person Link**:
The optional one-to-one association, within a Family Tree, between a Person and a System User.
_Avoid_: Email identity, membership

**Exact-email add**:
Adding an existing System User to a Family Tree by entering their complete normalized email address without search or suggestions.
_Avoid_: Invitation, user search

**Agent Credential**:
An API key owned by a System User whose effective access always equals that user's current Tree Membership permissions.
_Avoid_: Tree key, service superuser

