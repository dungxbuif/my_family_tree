#!/usr/bin/env python3
import argparse
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ops-root", type=Path, required=True)
    parser.add_argument("--source-tag", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--promotion-tag", required=True)
    parser.add_argument("--image", required=True)
    args = parser.parse_args()

    if not re.fullmatch(r"prod-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?", args.source_tag):
        raise SystemExit("invalid source release tag")
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_commit):
        raise SystemExit("source commit must be a full SHA")
    if args.promotion_tag != f"my-family-tree-{args.source_tag}":
        raise SystemExit("invalid promotion tag")
    if not re.fullmatch(r"registry-gitlab\.dungxbuif\.com/homelab/my-family-tree@sha256:[0-9a-f]{64}", args.image):
        raise SystemExit("image must be an immutable lab registry digest")

    repository, digest = args.image.split("@", 1)
    catalog_path = args.ops_root / "automation/stacks/catalog.yml"
    catalog = catalog_path.read_text(encoding="utf-8")
    entries = list(re.finditer(r"(?m)^  - id: family-tree\n(?:(?:    [^\n]*|)\n)*", catalog))
    if len(entries) != 1:
        raise SystemExit("expected exactly one family-tree catalog entry")
    entry = entries[0]
    image = (
        "    image:\n"
        f"      repository: {repository}\n"
        f"      digest: {digest}\n"
        f"      source_commit: {args.source_commit}\n"
    )
    updated, count = re.subn(r"(?m)^    image:\n(?:      [^\n]*\n)+", image, entry.group())
    if count != 1:
        raise SystemExit("expected exactly one family-tree catalog image block")

    manifest_path = args.ops_root / "environments/prod/my-family-tree.yaml"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = (
        "app: my-family-tree\n"
        "environment: prod\n"
        f"image: {args.image}\n"
        f"release_tag: {args.source_tag}\n"
        f"source_commit: {args.source_commit}\n"
        "service_name: family-tree\n"
        "data_target: /app/uploads\n"
        "route: https://family.dungxbuif.com\n"
        "health:\n"
        "  liveness: /readyz\n"
        "  readiness: /readyz\n"
        "migration:\n"
        "  enabled: true\n"
    )
    manifest_path.write_text(manifest, encoding="utf-8")
    catalog_path.write_text(catalog[:entry.start()] + updated + catalog[entry.end():], encoding="utf-8")


if __name__ == "__main__":
    main()
