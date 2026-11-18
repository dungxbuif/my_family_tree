# Separate system accounts, family-tree membership, and genealogical identity

The application supports multiple Family Trees per System User. Global Super Admin status only governs System User lifecycle; access to family data comes from an owner, editor, or viewer Tree Membership. A Person may optionally link one-to-one with a System User inside its tree, using exact normalized email only to establish the link and persisting the relationship by user ID. API keys belong to System Users and re-evaluate those same memberships on every request, so neither global administration nor an old credential silently bypasses current tree access.

## Consequences

- Public registration and account discovery remain disabled; Super Admins create accounts, while Owners add an existing account by exact email.
- Updating an unlinked Person to an existing account email may establish the Person Link and viewer membership; an existing link is never silently replaced.
- Every family-data query and mutation requires a validated Family Tree context, including imports, exports, private details, storage, REST, and MCP.
- The final Owner cannot be removed or demoted, and cross-tree relationships are rejected by database constraints.

