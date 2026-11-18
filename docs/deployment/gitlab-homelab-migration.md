# GitLab homelab group migration

## Dedicated storage credential rollout (2026-11-19)

The production storage target is the private `family-tree` bucket with prefix
`family-tree/`. Before cutover, copy the legacy `mac-ocr/family-tree/` objects
to the same keys in the dedicated bucket and compare every object's checksum.
Keep the legacy objects and service specification during the rollback window.
Changing the bucket preserves stored `/api/storage/family-tree/...` URLs.

Store the dedicated credential in the `Homelab Secret` 1Password vault.
Runtime uses Swarm secret files through `S3_ACCESS_KEY_ID_FILE` and
`S3_SECRET_ACCESS_KEY_FILE`. A configured file takes precedence over the direct
environment variable and an unreadable, empty or oversized file fails closed;
credentials and file contents are never included in errors. Local development
and rollback may retain `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` when the
corresponding file variable is unset. Build and promotion need no S3 keys.

Verification: focused storage tests cover file precedence and invalid files,
then a Linux amd64 image build and isolated `/readyz` smoke verify the artifact.
The ops release must separately verify DB/object access, preserve uploads, and
restore the previous service specification on a failed health check.

## Release preparation (2026-11-19)

The canonical repository is `homelab/my-family-tree` on GitLab. The owner creates a protected `prod-<semver>` tag from its `main`. The `ci-build` release job uses the existing shared Docker builder to build a `linux/amd64` image. Next.js compilation and TypeScript checking run inside the Docker build. A smoke check starts the image and checks `/readyz` over HTTP before publishing to the shared registry. Branch pushes, merges to main and merge requests create no pipeline; workflow ends with `when: never`.

App promotion uses protected `HOMELAB_OPS_PUSH_USER` and masked/protected `HOMELAB_OPS_PUSH_TOKEN` to atomically write the digest to `homelab-ops/main` and create `my-family-tree-prod-<semver>`. The shared YAML manifest follows the GitLab slug `my-family-tree`; the runtime service and catalog entry remain `family-tree`. Promotion updates the catalog image metadata while preserving operational fields. The ops runner tagged `cd-production` owns production deployment, health verification, and rollback.

For a pipeline change, check GitLab CI YAML and shell syntax, run the promoter against a local catalog fixture, build the image for `linux/amd64`, and run the image smoke in an isolated container. Before a production release, verify runner assignment, variable protection, protected app and ops tag patterns, and matching ops jobs.

### Runtime and data

- The target is VM100 Swarm service `family-tree` with `edge-http-net` and `family-data-net`. The image runs Next.js under Bun as an unprivileged user on port 3000. The canonical app slug and the Swarm service name differ.
- GitLab build and promotion consume `LAB_REGISTRY_HOST`, `LAB_REGISTRY_PUSH_USER`, `LAB_REGISTRY_PUSH_PASSWORD`, `HOMELAB_OPS_PUSH_USER`, and `HOMELAB_OPS_PUSH_TOKEN`. Ops needs its shared registry pull configuration. Keep credentials in protected CI variables and the runtime environment as appropriate.
- PostgreSQL uses `DATABASE_URL`. The image declares `/app/uploads` for legacy data. The unused local storage helper honors `UPLOAD_DIR`. The live upload and image routes use S3. Set `S3_ENDPOINT`, `S3_BUCKET=family-tree`, `S3_PREFIX=family-tree`, and credential file variables `S3_ACCESS_KEY_ID_FILE` / `S3_SECRET_ACCESS_KEY_FILE` mapped to app-specific Swarm secrets. `S3_REGION` defaults to `us-east-1`. Direct credential environment variables remain local/rollback fallbacks only when the matching file variable is unset. Image delivery accepts keys with an empty prefix or `family-tree`. Verify the chosen endpoint is reachable by browsers and its CORS policy permits the app origin to PUT presigned uploads. `SITE_NAME` configures the displayed site name.
- `docs/schema.sql` bootstraps a fresh database. The versioned SQL under `docs/migrations/` covers the lunar death date columns on older databases. The app has no automatic production migration, and the promoted manifest declares `migration.enabled: false`. Verify the production schema before the first image rollout.
- `scripts/backup.sh` captures the local Compose database and local uploads only. For production, confirm recent PostgreSQL, RustFS objects for `family-tree/family-tree/`, and any legacy upload-volume backup and restore evidence. During first cutover also retain the legacy `mac-ocr/family-tree/` objects and its rollback configuration.
- `/readyz` checks the Next.js process. A production verification must also exercise authenticated PostgreSQL reads and S3 upload and retrieval. Swarm rollback restores the previous service specification. Record its image and configuration for the first release and maintain a separate restore procedure for data.

### Ops enrollment complete

`homelab-ops/main` commit `7a82f82` owns the production manifest and protected
receipt-only validate/deploy/verify jobs for `my-family-tree`. Delivery removes
only the legacy `/opt/apps/family-tree/src:/app` bind, preserves uploads,
networks and database configuration, switches to the dedicated `family-tree`
bucket and file-backed Swarm secrets, and restores the exact prior task
specification if rollout verification fails. The release remains tag-driven;
an ops main push does not create a pipeline.

## Historical group migration

### Intended behavior

`my-family-tree` is owned by the private GitLab group `homelab` so group-level
CI/CD variables and runner policy can be shared without copying credentials
into each project. The repository remote is the group path
`homelab/my-family-tree`.

### Current state

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

### Verification plan

1. Assign/enable the protected `homelab-mac` runner for the group.
2. Add the existing shared credentials at group scope as masked/protected
   variables (`HOMELAB_OPS_PUSH_TOKEN` and registry credentials), without
   exposing their values.
3. Run the app pipeline from a protected `prod-<semver>` tag and verify the
   immutable digest promotion into `homelab-ops/main`.
4. Verify the matching internal ops receipt tag, VM100 health check, and
   rollback metadata.

### Deployment verification before the GitLab reset

The group runner and app-side pipeline are operational. App pipeline `#1035`
passed for source tag `prod-0.1.32`, and receipt pipeline `#1037` started the
VM100 rollout. The prior rollout converged the Swarm service but failed its
`/readyz` verification; the readiness handler is now explicitly dynamic. During
the new rollout, VM100 (`10.10.0.31`) became unreachable from both the local
host and Pi5, and the public GitLab and Family Tree endpoints returned 502.
Production is not considered complete until VM100 recovers and the matching ops
verify job passes `/readyz`.

The current runner permits only `always` image pulls; all job and service image
policies use `always`. The source release guard requires the tag commit to equal
the current `main` commit.

The release job builds and smokes the image before publishing it by immutable
digest. Runner pull policy remains `always`; availability of a cached base image
is not treated as release evidence.
