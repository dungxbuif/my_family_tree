# Separate system accounts, family-tree membership, and genealogical identity

The application supports multiple Family Trees per System User. Global Super Admin status only governs System User lifecycle; access to family data comes from an owner, editor, or viewer Tree Membership. A Person may optionally link one-to-one with a System User inside its tree, using exact normalized email only to establish the link and persisting the relationship by user ID. API keys belong to System Users and re-evaluate those same memberships on every request, so neither global administration nor an old credential silently bypasses current tree access.

## Consequences

- Public registration and account discovery remain disabled; Super Admins create accounts, while Owners add an existing account by exact email.
- Updating an unlinked Person to an existing account email may establish the Person Link and viewer membership; an existing link is never silently replaced.
- Every family-data query and mutation requires a validated Family Tree context, including imports, exports, private details, storage, REST, and MCP.
- The final Owner cannot be removed or demoted, and cross-tree relationships are rejected by database constraints.
- Membership removal, demotion, account suspension and account deletion must leave an active Owner in each affected tree. PostgreSQL also enforces the existing final-Owner row constraint at commit.
- Acquire the account lifecycle transaction lock before taking row locks. Tree creation and access management take the shared mode. Account administration takes the exclusive mode before locking its actor or target. A membership edit then locks its tree before the affected membership, Person or account rows. This prevents an account deletion from holding user rows while a membership transaction holds the tree needed by its cascading delete. Person editors that compose an email update must enter this order before locking the Person.

