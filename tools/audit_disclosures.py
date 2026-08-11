#!/usr/bin/env python3
"""Audit what HandScenes actually loads against what privacy.html discloses.

The privacy policy makes a factual claim about which outside services a
visitor's browser contacts. That claim silently rots every time a toy is added
with a CDN <script> tag. This script makes the claim checkable.

It scans the files that actually ship (git-tracked, excluding vendor/) for
external origins in *resource-loading* positions -- script src, stylesheet
link, img/media src, ES import, fetch/XHR, CSS url(). Plain <a href> links are
ignored on purpose: a link the user may click is not a request the page makes.

The set it finds is compared against three declarations:

  1. privacy.html          -- an HTML comment listing the hosts it discloses
  2. vercel.json           -- the Content-Security-Policy allowlist
  3. LICENSES.md           -- attribution required by third-party asset licences

Exit status is 0 when they agree, 1 when they do not.

    python tools/audit_disclosures.py

This is a deterministic text audit, not legal advice. It catches the specific
failure mode of an undisclosed origin; it cannot tell you whether the prose
around it is adequate for your jurisdiction.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Directories whose contents are self-hosted copies, not outside requests.
SKIP_DIRS = {"vendor", "graphify-out", ".git", "node_modules", "tools"}
SCAN_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json"}

# Config files describing the deploy, not code the browser runs. vercel.json's
# "$schema" key is an editor hint that is never fetched at runtime.
SKIP_FILES = {"vercel.json", "package.json", "package-lock.json"}

# Hosts a disclosed host pulls in on its own behalf. Google Fonts' stylesheet
# on fonts.googleapis.com @font-faces the actual woff2 files from gstatic, so
# gstatic is used whenever googleapis is -- the scanner cannot see inside a
# remote stylesheet, so the relationship is declared here.
IMPLIED_BY = {"fonts.googleapis.com": {"fonts.gstatic.com"}}

# Resource-loading positions only. Each pattern's group(1) is a URL.
RESOURCE_PATTERNS = [
    # <script src>, <img src>, <video src>, <audio src>, <source src>
    re.compile(r"""<(?:script|img|video|audio|source|iframe|track)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", re.I),
    # <link href> -- stylesheets, preload, prefetch, preconnect, dns-prefetch
    re.compile(r"""<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']""", re.I),
    # ES module import / dynamic import
    re.compile(r"""\bfrom\s+["']([^"']+)["']"""),
    re.compile(r"""\bimport\s*\(\s*["']([^"']+)["']"""),
    # fetch / XHR
    re.compile(r"""\bfetch\s*\(\s*["']([^"']+)["']"""),
    re.compile(r"""\.open\s*\(\s*["'][A-Z]+["']\s*,\s*["']([^"']+)["']""", re.I),
    # CSS url()
    re.compile(r"""url\(\s*["']?([^"')]+)["']?\s*\)"""),
    # importmap targets
    re.compile(r""""[^"]*"\s*:\s*"(https?://[^"]+)\""""),
]

HOST_RE = re.compile(r"^(?:https?:)?//([^/?#]+)", re.I)

# The marker may sit anywhere inside an HTML comment, after explanatory prose.
DISCLOSED_RE = re.compile(r"disclosed-hosts:(.*?)-->", re.S | re.I)
CSP_RE = re.compile(r'"Content-Security-Policy"\s*,\s*"value"\s*:\s*"(.*?)"', re.S)


def shipped_files() -> list[Path]:
    """Files that actually deploy: git-tracked, minus vendored/self-hosted dirs."""
    try:
        # tracked + untracked-but-not-ignored == what a deploy would upload,
        # so a new toy is audited before it is ever committed.
        out = subprocess.run(
            ["git", "-C", str(ROOT), "ls-files", "--cached", "--others", "--exclude-standard"],
            capture_output=True, text=True, check=True,
        ).stdout.splitlines()
        paths = [ROOT / line for line in out if line]
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("note: git unavailable; falling back to a full directory walk", file=sys.stderr)
        paths = [p for p in ROOT.rglob("*") if p.is_file()]

    keep = []
    for p in paths:
        rel = p.relative_to(ROOT)
        if set(rel.parts) & SKIP_DIRS or rel.name in SKIP_FILES:
            continue
        if p.suffix.lower() in SCAN_SUFFIXES:
            keep.append(p)
    return keep


def external_hosts(files: list[Path]) -> dict[str, set[str]]:
    """Map external host -> set of repo-relative files that load from it."""
    found: dict[str, set[str]] = {}
    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for pattern in RESOURCE_PATTERNS:
            for url in pattern.findall(text):
                m = HOST_RE.match(url.strip())
                if not m:
                    continue  # relative path == same origin
                host = m.group(1).lower().split("@")[-1]
                found.setdefault(host, set()).add(str(path.relative_to(ROOT)).replace("\\", "/"))
    return found


def disclosed_hosts() -> set[str]:
    privacy = ROOT / "privacy.html"
    if not privacy.exists():
        return set()
    m = DISCLOSED_RE.search(privacy.read_text(encoding="utf-8"))
    if not m:
        return set()
    return {h.strip().lower() for h in m.group(1).split() if h.strip()}


def csp_hosts() -> set[str]:
    cfg = ROOT / "vercel.json"
    if not cfg.exists():
        return set()
    m = CSP_RE.search(cfg.read_text(encoding="utf-8"))
    if not m:
        return set()
    hosts = set()
    for token in m.group(1).split():
        hm = HOST_RE.match(token.strip(";"))
        if hm:
            hosts.add(hm.group(1).lower())
    return hosts


def credited_sources() -> set[str]:
    lic = ROOT / "LICENSES.md"
    if not lic.exists():
        return set()
    # Every `backticked` token in the file counts as a credited filename. One
    # bullet may name several assets ("`a.onnx`, `b.onnx`, `c.onnx` -- ..."), so
    # take them all rather than just the first on the line.
    text = lic.read_text(encoding="utf-8").lower()
    return set(re.findall(r"`([^`]+)`", text))


def main() -> int:
    files = shipped_files()
    used = external_hosts(files)
    for host in list(used):
        for implied in IMPLIED_BY.get(host, set()):
            used.setdefault(implied, set()).add(f"(pulled in by {host})")
    disclosed = disclosed_hosts()
    csp = csp_hosts()

    print(f"scanned {len(files)} shipped files\n")

    print("external origins the browser is asked to contact:")
    if not used:
        print("  (none -- everything is same-origin)")
    for host in sorted(used):
        print(f"  {host}")
        for f in sorted(used[host]):
            print(f"      {f}")
    print()

    problems: list[str] = []
    warnings: list[str] = []

    undisclosed = set(used) - disclosed
    if undisclosed:
        problems.append(
            "loaded but NOT disclosed in privacy.html: " + ", ".join(sorted(undisclosed))
            + "\n    -> add a paragraph to the 'Third parties' section, then list the host"
              "\n       in the <!-- disclosed-hosts: ... --> comment."
        )

    stale = disclosed - set(used)
    if stale:
        problems.append(
            "disclosed in privacy.html but no longer loaded: " + ", ".join(sorted(stale))
            + "\n    -> the policy over-discloses; trim it so it stays accurate."
        )

    blocked = set(used) - csp
    if blocked:
        problems.append(
            "loaded but NOT in the vercel.json CSP: " + ", ".join(sorted(blocked))
            + "\n    -> these requests will be blocked in production."
        )

    # Advisory only: an origin can be reached by code the scanner cannot read
    # (inside a vendored bundle), so dropping it needs a runtime check first.
    unused_csp = csp - set(used)
    if unused_csp:
        warnings.append(
            "allowed by CSP but not seen in any shipped file: " + ", ".join(sorted(unused_csp))
            + "\n    -> possible tightening. Verify at runtime before removing:"
              "\n       a vendored bundle may reach it without a literal URL."
        )

    # Asset licences that require attribution.
    credited = credited_sources()
    # rglob, not glob: nested asset dirs (models/style/*.onnx) must be covered too.
    models = {p.name for p in (ROOT / "models").rglob("*") if p.is_file()} if (ROOT / "models").exists() else set()
    uncredited = {m for m in models if m.lower() not in credited}
    if uncredited and (ROOT / "LICENSES.md").exists():
        problems.append(
            "asset files with no LICENSES.md entry: " + ", ".join(sorted(uncredited))
            + "\n    -> confirm the licence and credit it (CC BY / BY-SA require attribution)."
        )
    elif not (ROOT / "LICENSES.md").exists():
        problems.append("LICENSES.md is missing -- third-party asset attribution is untracked.")

    if warnings:
        print("WARNINGS (advisory, do not fail the audit)")
        for w in warnings:
            print(f"  - {w}")
        print()

    if problems:
        print("PROBLEMS")
        for p in problems:
            print(f"  - {p}")
        print("\nFAIL: the privacy policy, the CSP and the code do not agree.")
        return 1

    print("OK: loaded origins, privacy.html disclosures and the CSP all agree,")
    print("    and every shipped asset has a licence entry.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
