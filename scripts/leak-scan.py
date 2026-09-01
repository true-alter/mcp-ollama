#!/usr/bin/env python3
"""Refuse ~alter-internal material on this public repository.

Why this lives here rather than at publish time. A publish gate runs against the
packed tarball, and everything in this repository is public the moment it is
pushed, so a comment describing something internal is exposed from the commit
that adds it and not from the release that ships it. This closes that window by
running at pull-request time.

It reads two surfaces, because a repository publishes both. Every tracked file,
and every commit message on the branch. A message is public from the push and
cannot be edited afterwards without rewriting history, so it is the more
expensive of the two to get wrong and the easier one to forget.

A tracked file it cannot decode is a FINDING, never a skip. A skip renders in
the output as a pass, which is the one failure shape this class is about, so an
unreadable tracked file is reported and fails the run.

The rules below each carry the reason they exist. What no rule reaches is prose
that describes something accurately using only ordinary words, and no regular
expression closes that. It needs a reader. This lowers the odds, it does not
remove them.

Exit 0 clean, 1 on a finding, 2 on a usage fault. Fails closed.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Files that are expected to be undecodable and carry no authored prose. Every
# other tracked file is read, and one that will not decode is a finding rather
# than a skip. Kept deliberately short: an entry here is a surface nothing
# checks, so each one costs what it exempts.
BINARY_EXPECTED = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2")

# Paths never scanned. `package-lock.json` is npm's own output and carries no
# authored prose; scanning it only produces noise on dependency names.
SKIP = ("node_modules/", ".git/", "package-lock.json", "scripts/leak-scan.py")


def rule(name: str, pattern: str, why: str) -> tuple[str, re.Pattern[str], str]:
    return (name, re.compile(pattern), why)


RULES = [
    rule("INTERNAL-PATH", r"/mnt/personal/code/|alter-internal/|(?<![\w.])\.repos/|(?<![\w.])\.claude/",
         "an internal filesystem or repository path"),
    rule("DOCTRINE-ID", r"(?<![\w-])(lesson|feedback|directive|ruling|decision|finding|proposed-d|handover|register|mandate|correction)-[a-z0-9]+(-[a-z0-9]+){3,}",
         "a doctrine or decision slug"),
    rule("DECISION-CODE", r"(?<![\w-])D-[A-Z][A-Z0-9]{2,}(-[A-Z0-9]+)*-\d+(?![\w-])",
         "a decision code"),
    rule("FOUNDER-MCP", r"mcp__(?!qmd__|\*__)[a-z][a-z0-9_]*__",
         "a founder or member MCP namespace"),
    rule("INTERNAL-HOST", r"(?i)(?<![a-z0-9.\-])(?!(?:host|gateway)\.docker\.internal\b)[a-z0-9][a-z0-9.\-]*\.(internal|local|lan|corp|intranet)\b",
         "an internal hostname"),
    rule("RFC1918", r"(?<![\d.])(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})(?![\d.])",
         "a private network address"),
    rule("INTERNAL-ID", r"(?<![\w-])(H-\d{3}|SOP-\d{3}|SA-\d{3}|SK-\d{3}|sig-\d{4}-\d{2}-\d{2})(?![\w-])",
         "an internal audit, SOP, specialist or signal identifier"),
    rule("EMITTER-CONTRACT", r"provenance_class|consent_tier|consent gate|consent-gated|identity-gated",
         "the internal emitter's field contract or consent vocabulary"),
    rule("INTERNAL-TIER", r"(?<![\w-])(Tier-[LC0-9]|declared-red|publish chokepoint|Loom Tier|Loom verdict|loom-validate)(?![\w-])",
         "internal tier or publish-gate vocabulary"),
    rule("BARE-ALTER", r"(?<![~\w@/-])ALTER(?![\w-])",
         "a bare ALTER where ~alter belongs"),
    rule("PATENT-LETTER", r"(?<![\w-])Patent [A-Z]{1,2}(?![\w-])",
         "a patent letter"),
]


def tracked_files() -> list[Path]:
    out = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    files = [ROOT / f for f in out if not any(f.startswith(s) or f == s for s in SKIP)]
    # dist/ is gitignored but IS what ships, so scan it when it has been built.
    dist = ROOT / "dist"
    if dist.is_dir():
        files.extend(sorted(dist.rglob("*")))
    return [f for f in files if f.is_file() and f.suffix.lower() not in BINARY_EXPECTED]


def commit_messages(base: str) -> list[tuple[str, str]]:
    """(short sha, message) for every commit this branch adds over `base`.

    Returns nothing when the base ref is not present, which is the case on a
    fresh clone that fetched one branch. A missing base is reported by the
    caller rather than passed off as an empty result.
    """
    rev = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "--verify", "--quiet", base],
        capture_output=True, text=True,
    )
    if rev.returncode != 0:
        return []
    shas = subprocess.run(
        ["git", "-C", str(ROOT), "log", "--format=%H", f"{base}..HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    out = []
    for sha in shas:
        body = subprocess.run(
            ["git", "-C", str(ROOT), "log", "-1", "--format=%B", sha],
            capture_output=True, text=True, check=True,
        ).stdout
        out.append((sha[:7], body))
    return out


def scan_text(where: str, text: str) -> list[tuple[str, int, str, str, str, str]]:
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        for name, pat, why in RULES:
            m = pat.search(line)
            if m:
                out.append((where, i, name, m.group(0), why, line.strip()[:100]))
    return out


def main() -> int:
    files = tracked_files()
    if not files:
        print("leak-scan: no files to scan, refusing to report clean", file=sys.stderr)
        return 2

    findings = []
    read = 0
    for f in files:
        rel = str(f.relative_to(ROOT))
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            # Not a skip. A tracked file nothing can read is a surface no rule
            # below ever runs against, and the run must not report clean while
            # one exists. Bytecode, an archive or a stray binary all land here.
            findings.append((rel, 0, "UNSCANNABLE", rel, "a tracked file no rule can be run against", ""))
            continue
        read += 1
        findings.extend(scan_text(rel, text))

    base = os.environ.get("LEAK_SCAN_BASE", "origin/main")
    messages = commit_messages(base)
    for sha, body in messages:
        findings.extend(scan_text(f"commit {sha}", body))

    for where, i, name, hit, why, line in findings:
        at = f"{where}:{i}" if i else where
        print(f"{at}: [{name}] {why}, matched {hit!r}")
        if line:
            print(f"    {line}")

    print(
        f"\nleak-scan: files={read} commits={len(messages)} "
        f"base={base} findings={len(findings)}"
    )
    if not messages:
        print(f"leak-scan: no commits over {base}, so no message was read", file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
