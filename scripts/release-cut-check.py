#!/usr/bin/env python3
"""release-cut-check.py, one standard for every release cut in the estate.

A version is named in more places than a cut remembers. `@truealter/sdk` names
it in `package.json` and twice in `package-lock.json`; `mcp-ollama` names it in
`package.json`, twice in `package-lock.json`, and twice more in `server.json`,
which is what the official MCP registry reads. A cut that moves one of those
and not the others is the ordinary case, not the unlucky one, and on
2026-09-04 it shipped: 0.2.2 went to a pull request with `server.json` still
reading 0.2.1, and only GitHub said so.

The second half is the changelog. `@truealter/sdk` published 0.5.10 in August
and 0.5.11 in September with no heading for either, so its newest heading was
0.5.9 from June and 95 lines of notes could no longer be attributed to any
version at all. That is not recoverable later without archaeology.

So this asserts two things per release surface, and nothing else:

  1. Every file in the surface's own directory that names its version agrees.
  2. `CHANGELOG.md` carries a heading for that version.

WHY IT IS DRIVEN BY THE MANIFEST. `release-surface-manifest.json` already
enumerates every artefact the estate publishes and where its version lives.
A second list would go stale against the first the moment an eleventh surface
ships, which is exactly how the npm-surface list went stale and had to be
replaced by a test. There is one list, and this reads it.

WHAT IT DOES NOT DO. It does not know what the version SHOULD be, and it must
not: choosing the next version is the author's, and asserting a chosen number
against a registry is `release-manifest-validate.py` and
`release-tag-preflight-check.sh`, both of which already exist. This one only
asserts internal agreement, which is the half nothing was checking.

USAGE
  scripts/release-cut-check.py                  every surface in the manifest
  scripts/release-cut-check.py --surface @truealter/sdk
  scripts/release-cut-check.py --changed a.json b.json   only surfaces touching
                                                         these paths
  scripts/release-cut-check.py --dir .          one directory, no manifest

`--dir` is what a sibling repo runs. The manifest lives in this monorepo and a
public repo cannot read it, so a copy of this file placed in `true-alter/<repo>`
checks the directory it sits beside instead. That is the same check, not a
lesser one: the manifest only ever supplied the list of directories.

EXIT
  0  every checked surface agrees with itself
  1  at least one disagreement
  2  the manifest could not be read

Anchor: lesson-a-handover-listed-merge-the-pr-as-the-next-act-while-the-cut-had-left-server-json-behind-and-the-branch-was-red-2026-09-04
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "release-surface-manifest.json"


def _primary_checkout() -> Path:
    """Where `.repos/` actually is.

    Sibling repos are cloned into `.repos/` in the PRIMARY checkout only, and
    they are gitignored, so a linked worktree has no `.repos` at all. Resolving
    against the script's own parent means nine of ten surfaces silently go
    unread whenever this runs from a worktree, which is where most work
    happens. `git rev-parse --git-common-dir` points at the primary `.git` from
    any worktree, and its parent is the primary tree. Same resolution the
    PreToolUse hook wiring in `.claude/settings.json` uses, for the same
    reason.
    """
    if (REPO_ROOT / ".repos").is_dir():
        return REPO_ROOT
    try:
        import subprocess

        common = subprocess.run(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return REPO_ROOT
    if not common:
        return REPO_ROOT
    base = Path(common)
    if not base.is_absolute():
        base = REPO_ROOT / base
    primary = base.parent.resolve()
    return primary if (primary / ".repos").is_dir() else REPO_ROOT


# A heading in either Keep-a-Changelog form. The bracketed form is what every
# changelog in the estate uses; the bare form is accepted so a repo that drops
# the brackets is not failed for punctuation.
HEADING = re.compile(r"^##\s*\[?v?([0-9][0-9A-Za-z.\-+]*)\]?", re.MULTILINE)


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _read_toml(path: Path):
    try:
        with path.open("rb") as fh:
            return tomllib.load(fh)
    except (OSError, tomllib.TOMLDecodeError):
        return None


def versions_in(path: Path) -> list[tuple[str, str]]:
    """Every version this file states, as (where, value) pairs.

    `where` is a human-readable pointer, not a JSON path, because it is only
    ever printed. A file this does not recognise contributes nothing rather
    than raising, so an unfamiliar file in a release directory cannot fail a
    cut it has no opinion about.
    """
    name = path.name
    found: list[tuple[str, str]] = []

    if name in ("package.json", "server.json", "manifest.json"):
        data = _read_json(path)
        if not isinstance(data, dict):
            return found
        if isinstance(data.get("version"), str):
            found.append((f"{name}:version", data["version"]))
        # server.json states it a second time, once per published package, and
        # that is the copy the MCP registry resolves.
        for i, pkg in enumerate(data.get("packages") or []):
            if isinstance(pkg, dict) and isinstance(pkg.get("version"), str):
                found.append((f"{name}:packages[{i}].version", pkg["version"]))
        return found

    if name == "package-lock.json":
        data = _read_json(path)
        if not isinstance(data, dict):
            return found
        if isinstance(data.get("version"), str):
            found.append((f"{name}:version", data["version"]))
        root_pkg = (data.get("packages") or {}).get("")
        if isinstance(root_pkg, dict) and isinstance(root_pkg.get("version"), str):
            found.append((f'{name}:packages[""].version', root_pkg["version"]))
        return found

    if name == "pyproject.toml":
        data = _read_toml(path)
        if not isinstance(data, dict):
            return found
        v = (data.get("project") or {}).get("version")
        if isinstance(v, str):
            found.append((f"{name}:project.version", v))
        return found

    if name == "Cargo.toml":
        data = _read_toml(path)
        if not isinstance(data, dict):
            return found
        v = (data.get("package") or {}).get("version")
        if isinstance(v, str):
            found.append((f"{name}:package.version", v))
        return found

    return found


# The files a release directory may name its version in. Deliberately a closed
# list: a glob would pull in fixtures, node_modules and test data, and a check
# that fails on somebody's test fixture gets disabled rather than fixed.
COMPANIONS = (
    "package.json",
    "package-lock.json",
    "server.json",
    "manifest.json",
    "pyproject.toml",
    "Cargo.toml",
)


def changelog_has(directory: Path, version: str) -> tuple[bool, str]:
    """Does a changelog beside this surface carry a heading for `version`?

    Returns (ok, detail). A missing changelog is reported as its own state
    rather than passing, because a release surface with no changelog at all is
    a thing worth saying out loud once, not a silent pass forever.
    """
    path = directory / "CHANGELOG.md"
    if not path.exists():
        return False, "no CHANGELOG.md beside the manifest"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        return False, f"CHANGELOG.md unreadable: {exc}"
    headings = HEADING.findall(text)
    if version in headings:
        return True, ""
    newest = next((h for h in headings if h.lower() != "unreleased"), None)
    return False, (
        f"CHANGELOG.md has no heading for {version}"
        + (f" (newest is {newest})" if newest else " (no version headings at all)")
    )


def surfaces(manifest: dict) -> list[dict]:
    out = []
    for pkg in manifest.get("packages") or []:
        local = (pkg.get("source") or {}).get("local_path")
        if not local:
            continue
        # A surface INSIDE this repository is read from the checkout the caller
        # is standing in, because that is where the cut being checked lives.
        # Only the gitignored `.repos/` clones come from the primary checkout,
        # since a linked worktree has none. Resolving both against the primary
        # made the pre-commit hook pass a worktree cut it had never looked at.
        root = _primary_checkout() if local.startswith(".repos/") else REPO_ROOT
        out.append({"name": pkg.get("name") or local, "path": root / local})
    return out


def stale_checkout(directory: Path) -> str | None:
    """Is this a clean clone sitting behind its remote?

    `.repos/` clones are pulled by `/sync` and are routinely several commits
    behind. Reading such a tree and failing on what it says manufactures a
    defect that does not exist on the remote: on 2026-09-04 this reported
    mcp-ollama's lockfile as drifted when origin/main had both files at 0.2.2
    and only the local clone was seven commits back.

    A DIRTY tree is a cut in progress and is exactly what this check is for, so
    it is read whatever its distance from the remote. A CLEAN tree that is
    behind is not a cut at all, and it is skipped VISIBLY rather than passed or
    failed. Returns a reason to skip, or None to read it.
    """
    import subprocess

    def git(*args: str) -> str:
        try:
            return subprocess.run(
                ["git", "-C", str(directory), *args],
                capture_output=True,
                text=True,
                timeout=10,
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    if not git("rev-parse", "--git-dir"):
        return None
    if git("status", "--porcelain"):
        return None
    behind = git("rev-list", "--count", "HEAD..@{upstream}")
    if behind.isdigit() and int(behind) > 0:
        return f"clean checkout {behind} commit(s) behind its remote, run /sync"
    return None


def check(surface: dict) -> list[str]:
    """Every disagreement this surface carries. Empty means clean.

    A surface whose file is absent is NOT a disagreement and is NOT clean: it
    is unread, and the caller records it separately. Sibling repos are
    gitignored clones that only exist in the primary checkout, so this runs
    from a worktree and sees eight of ten surfaces missing. Folding that into
    "clean" is the bare-zero failure `rule-first-run-value-must-be-visible-
    without-a-hidden-setting-and-an-empty-result-must-say-whether-empty-is-
    expected-2026-08-20` names, and it happened here before the skip was made
    visible.
    """
    primary = surface["path"]
    name = surface["name"]
    if not primary.exists():
        surface["skipped"] = "not cloned in this checkout"
        return []

    stale = stale_checkout(primary.parent)
    if stale:
        surface["skipped"] = stale
        return []

    stated = versions_in(primary)
    if not stated:
        # A Dockerfile is a listed surface with no parseable version field.
        surface["skipped"] = f"{primary.name} states no version this check can read"
        return []

    version = stated[0][1]
    directory = primary.parent
    problems = []

    seen = list(stated)
    for companion in COMPANIONS:
        candidate = directory / companion
        if candidate == primary or not candidate.exists():
            continue
        seen.extend(versions_in(candidate))

    for where, value in seen:
        if value != version:
            problems.append(
                f"{name}: {where} says {value}, {primary.name} says {version}"
            )

    ok, detail = changelog_has(directory, version)
    if not ok:
        problems.append(f"{name}: {detail}")

    return problems


def _report(problems: list[str], todo: list[dict]) -> int:
    checked = [s["name"] for s in todo if not s.get("skipped")]
    skipped = [(s["name"], s["skipped"]) for s in todo if s.get("skipped")]

    if problems:
        print("release-cut-check: a release surface disagrees with itself.\n")
        for p in problems:
            print(f"  {p}")
        print(
            "\nEvery place a version is named has to move together, and the "
            "version needs a changelog heading before it is published. "
            "Fix the files above, not this check."
        )
    else:
        print(
            "release-cut-check: clean "
            f"({', '.join(checked) if checked else 'NOTHING WAS READ'})"
        )

    # Always printed, pass or fail. A surface this could not read is the one
    # thing a green line must never be allowed to imply it checked.
    for name, why in skipped:
        print(f"  not checked: {name}, {why}")
    if skipped and not checked:
        print(
            "  Nothing in scope was readable. Run this from the primary "
            "checkout, where the sibling repos are cloned."
        )

    return 1 if problems else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--surface", action="append", help="check only this surface name")
    ap.add_argument(
        "--changed",
        nargs="*",
        default=None,
        help="check only surfaces whose directory contains one of these paths",
    )
    ap.add_argument(
        "--dir",
        help="check this directory alone, without reading the manifest",
    )
    args = ap.parse_args()

    if args.dir:
        directory = Path(args.dir).resolve()
        primary = next(
            (directory / c for c in COMPANIONS if (directory / c).exists()), None
        )
        if primary is None:
            print(
                f"release-cut-check: {directory} names no version in any of "
                + ", ".join(COMPANIONS),
                file=sys.stderr,
            )
            return 2
        surface = {"name": directory.name, "path": primary}
        return _report(check(surface), [surface])

    manifest = _read_json(MANIFEST)
    if manifest is None:
        print(f"release-cut-check: cannot read {MANIFEST}", file=sys.stderr)
        return 2

    todo = surfaces(manifest)

    if args.surface:
        wanted = set(args.surface)
        todo = [s for s in todo if s["name"] in wanted]
        missing = wanted - {s["name"] for s in todo}
        for m in sorted(missing):
            print(
                f"release-cut-check: no surface named {m} in the manifest",
                file=sys.stderr,
            )
        if missing:
            return 2

    if args.changed is not None:
        # pre-commit hands the staged paths. A surface is in scope when one of
        # them sits in its directory, so editing an unrelated file never runs
        # the whole estate's check.
        touched = {Path(p).resolve() for p in args.changed}
        todo = [s for s in todo if any(t.parent == s["path"].parent for t in touched)]
        if not todo:
            return 0

    problems = []
    for surface in todo:
        problems.extend(check(surface))

    return _report(problems, todo)


if __name__ == "__main__":
    sys.exit(main())
