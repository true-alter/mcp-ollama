#!/usr/bin/env python3
"""Validate server.json against the registry schema it declares.

The registry rejects a submission that does not validate, and the rejection
lands on whoever runs the submit, long after the file was written. This runs
the same check in CI so the file cannot go stale against its own $schema.

Reads the $schema URL out of the file rather than pinning one here, so bumping
the file to a newer registry schema needs no change in this script.
"""
import json
import sys
import urllib.request
from pathlib import Path

import jsonschema

path = Path(__file__).resolve().parent.parent / "server.json"
doc = json.loads(path.read_text(encoding="utf-8"))

url = doc.get("$schema")
if not url:
    sys.exit("server.json declares no $schema, so nothing can validate it")

with urllib.request.urlopen(url, timeout=30) as fh:
    schema = json.load(fh)

errors = sorted(jsonschema.Draft7Validator(schema).iter_errors(doc), key=lambda e: list(e.path))

# Ownership verification, which the schema cannot express and the registry
# enforces at submit time. It reads mcpName out of the published npm package
# and refuses the entry unless it equals server.json's name, so the two files
# disagreeing is a rejection that lands on whoever runs the submit.
pkg = json.loads((path.parent / "package.json").read_text(encoding="utf-8"))
ownership: list[str] = []

mcp_name = pkg.get("mcpName")
if mcp_name != doc.get("name"):
    ownership.append(
        f"package.json mcpName ({mcp_name!r}) must equal server.json name "
        f"({doc.get('name')!r}); the registry verifies npm ownership through it"
    )

for index, package in enumerate(doc.get("packages", [])):
    if package.get("registryType") != "npm":
        continue
    if package.get("identifier") != pkg.get("name"):
        ownership.append(
            f"packages[{index}].identifier ({package.get('identifier')!r}) "
            f"must equal package.json name ({pkg.get('name')!r})"
        )
    if package.get("version") != pkg.get("version"):
        ownership.append(
            f"packages[{index}].version ({package.get('version')!r}) "
            f"must equal package.json version ({pkg.get('version')!r})"
        )

if doc.get("version") != pkg.get("version"):
    ownership.append(
        f"server.json version ({doc.get('version')!r}) must equal "
        f"package.json version ({pkg.get('version')!r})"
    )

if not errors and not ownership:
    print(f"server.json validates against {url}, and agrees with package.json")
    sys.exit(0)

if errors:
    print(f"server.json does NOT validate against {url}", file=sys.stderr)
    for err in errors:
        where = "/".join(str(part) for part in err.path) or "(root)"
        print(f"  {where}: {err.message}", file=sys.stderr)
if ownership:
    print("server.json and package.json disagree:", file=sys.stderr)
    for line in ownership:
        print(f"  {line}", file=sys.stderr)
sys.exit(1)
