#!/usr/bin/env bash
# loom-verdict.sh, this repository's own pre-publish verdict.
#
# The monorepo's Loom Tier-0 validator does not apply here. Its checks are
# scoped backend pytest, mypy and vitest over a Python and Next.js tree. This
# is a small TypeScript MCP server. Without this file the publish chokepoint
# reads "the monorepo validator is not in this repo" as "this branch has been
# judged by nothing", and halts, which is the correct refusal and the reason
# this file exists rather than an argument against it.
#
# What is green here is exactly what .github/workflows/ci.yml runs, plus the
# manifest check the release path depends on:
#
#   1. npm ci, against the committed lockfile.
#   2. npm run build, the tsc compile that produces dist/.
#   3. scripts/validate-server-json.py, the registry manifest check. The
#      registry rejects a manifest that does not validate and the rejection
#      otherwise lands on whoever runs the submit, not on the commit.
#
# No declared-red carve-out. Every failure halts.
set -uo pipefail

cd "$(dirname "$0")/.."

echo "== install =="
if ! npm ci; then
    echo "VERDICT RED: npm ci failed." >&2
    exit 1
fi

echo
echo "== build =="
if ! npm run build; then
    echo "VERDICT RED: tsc build failed." >&2
    exit 1
fi

echo
echo "== registry manifest =="
if ! python3 scripts/validate-server-json.py; then
    echo "VERDICT RED: server.json does not validate against its declared schema." >&2
    exit 1
fi

echo
echo "VERDICT GREEN"
