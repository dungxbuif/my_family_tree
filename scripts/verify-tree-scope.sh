#!/bin/sh
set -eu
report=$(mktemp)
trap 'rm -f "$report"' EXIT
for suite in utils/auth/tree-access.test.ts tests/tree-isolation.test.ts; do
  if [ ! -s "$suite" ]; then
    echo "Production promotion requires $suite" >&2
    exit 1
  fi
  bun test --reporter=junit --reporter-outfile="$report" "./$suite"
  if ! awk '/<testcase / { tests++ } /<skipped/ { skipped++ } END { exit !(tests > skipped) }' "$report"; then
    echo "Production promotion requires executed tests in $suite" >&2
    exit 1
  fi
done
