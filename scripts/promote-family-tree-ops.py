#!/usr/bin/env python3
import argparse
import json
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
    if not re.fullmatch(r"family-tree-prod-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?", args.promotion_tag):
        raise SystemExit("invalid promotion tag")
    if not re.fullmatch(r"registry-gitlab\.dungxbuif\.com/dungxbuif/my-family-tree@sha256:[0-9a-f]{64}", args.image):
        raise SystemExit("image must be an immutable lab registry digest")

    manifest_path = args.ops_root / "environments/prod/family-tree.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema_version": 1,
        "app": "family-tree",
        "source_tag": args.source_tag,
        "source_commit": args.source_commit,
        "promotion_tag": args.promotion_tag,
        "image": args.image,
        "service_name": "family-tree",
        "data_volume": "family-tree-uploads",
        "data_target": "/app/uploads",
        "migration": {"enabled": False},
        "health": {"url": "https://family.dungxbuif.com/readyz", "expected_status": 200},
        "rollback": {"policy": "docker-service-update-rollback"},
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    catalog_path = args.ops_root / "automation/stacks/catalog.yml"
    catalog = catalog_path.read_text(encoding="utf-8")
    block = (
        "  - id: family-tree\n"
        "    target: {host: vm100, mode: swarm}\n"
        "    image:\n"
        "      repository: registry-gitlab.dungxbuif.com/dungxbuif/my-family-tree\n"
        f"      digest: {args.image.rsplit('@sha256:', 1)[1]}\n"
        f"      source_commit: {args.source_commit}\n"
        "    data_mounts: [/app/uploads]\n"
        "    networks: [edge-http-net, family-data-net]\n"
        "    routes: [family]\n"
        "    health: {path: /readyz, expected_status: [200]}\n"
        "    resources: {}\n"
        "    release_template_id: 8\n"
        "    rollback_image: oven/bun:1-slim\n"
        "    deployable: true\n"
    )
    pattern = r"(?ms)^  - id: family-tree\n.*?(?=^  - id: )"
    updated, count = re.subn(pattern, block, catalog, count=1)
    if count != 1:
        raise SystemExit("family-tree catalog entry not found")
    catalog_path.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    main()
