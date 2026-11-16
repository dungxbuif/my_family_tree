# GitLab homelab group migration

Status: in progress (2026-11-17)

## Intended behavior

`my-family-tree` is owned by the private GitLab group `homelab` so group-level
CI/CD variables and runner policy can be shared without copying credentials
into each project. The repository remote is the group path
`homelab/my-family-tree`.

## Current state

- GitLab group `homelab` exists (private, group ID 49).
- `my-family-tree` has been transferred successfully to
  `https://gitlab.dungxbuif.com/homelab/my-family-tree`.
- Homelab application projects transferred successfully: `mezonhook`,
  `mypocket`, `couchloom`, and `devtool`.
- Group CI/CD variables currently show zero entries; no secret values were
  invented or copied. Masked values cannot be recovered from a project UI.
- The project pipeline still requires the protected `homelab-mac` runner and
  approved group-scoped credentials before a production release can run.
- `homelab-ops` and `homelab-automation` cannot be transferred while tagged
  container images exist in their registries; deleting those images is not part
  of this migration.
- The same registry-tag restriction currently blocks `Homepage`, `k8s-syntax`,
  `db-management`, and `RelayHub`; these remain in the user namespace until
  their registry retention/migration is handled deliberately.

## Verification plan

1. Assign/enable the protected `homelab-mac` runner for the group.
2. Add the existing shared credentials at group scope as masked/protected
   variables (`HOMELAB_OPS_PUSH_TOKEN` and registry credentials), without
   exposing their values.
3. Run the app pipeline from a protected `prod-<semver>` tag and verify the
   immutable digest promotion into `homelab-ops/main`.
4. Verify the matching internal ops receipt tag, VM100 health check, and
   rollback metadata.
