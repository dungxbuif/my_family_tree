# GitLab homelab group migration

Status: release verification in progress (2026-11-17)

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
- Group CI/CD variables now contain masked/protected `HOMELAB_OPS_PUSH_TOKEN`,
  registry pull variables, and family-tree deploy-token variables.
- The protected `homelab-mac` runner is online and app pipeline `#995`
  (`prod-0.1.22`) passed end-to-end; later acceptance tags were used while
  repairing the VM100 registry pull contract.
- The group runner is now online as `homelab-mac`. Docker image builds use the
  Mac runner's mounted Docker Desktop socket; rootless dind was incompatible
  with this runner's service networking and TLS mount.
- Group variable `HOMELAB_OPS_PUSH_TOKEN` is now present as masked/protected,
  backed by the `homelab-ops` project access token. Registry login prefers
  approved group push credentials and falls back to GitLab's job credentials or
  the existing protected pull credentials when those are not configured.
- Promotion validation and the ops catalog use the moved image path
  `registry-gitlab.dungxbuif.com/homelab/my-family-tree`.
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

## Latest deployment verification

The group runner and app-side pipeline are operational. App pipeline `#1031`
passed for source tag `prod-0.1.31`, and ops receipt pipeline `#1033`
converged the VM100 Swarm service. The public `/about` endpoint returns 200,
but the first verify attempt still returned 404 for `/readyz`; the readiness
handler is now explicitly dynamic and will be re-released before declaring
production ready. Do not report production deployment complete until the ops
verify job passes `/readyz`.

The Mac runner also uses `if-not-present` image pulls so transient Docker Hub
anonymous-pull limits do not block validation when the pinned toolchain image is
already cached on the runner.

The image build likewise avoids forcing a remote base-image refresh on every
release; the pinned Bun base remains runner-cached and the immutable application
digest is still verified after push.
