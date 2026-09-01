#!/usr/bin/env bash
# This repository's own pre-publish verdict.
#
# This repository defines what green means for itself rather than inheriting a
# definition written for a different stack. Reporting no verdict at all reads as
# unjudged rather than as passing, which is the correct way round, so this file
# says it explicitly.
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
# There are no exemptions. Every failure halts.
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
