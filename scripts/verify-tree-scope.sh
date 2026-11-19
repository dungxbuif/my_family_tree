#!/bin/sh
set -eu
report_dir=$(mktemp -d)
trap 'rm -rf "$report_dir"' EXIT
for suite in utils/auth/tree-access.test.ts tests/tree-isolation.test.ts tests/secondary-tree-isolation.test.ts tests/data-tools-isolation.test.ts tests/agent-rest.test.ts; do
  if [ ! -s "$suite" ]; then
    echo "Production promotion requires $suite" >&2
    exit 1
  fi
  report="$report_dir/${suite##*/}.xml"
  bun test --reporter=junit --reporter-outfile="$report" "./$suite"
  if [ ! -s "$report" ]; then
    echo "Production promotion requires a test report from $suite" >&2
    exit 1
  fi
  if ! awk '/<testcase / { tests++ } /<skipped/ { skipped++ } END { exit !(tests > 0 && skipped == 0) }' "$report"; then
    echo "Production promotion requires all tests to execute in $suite" >&2
    exit 1
  fi
done
