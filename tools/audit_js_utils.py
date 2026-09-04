"""Audit web/ extensions for local copies of shared JS utilities.

Shared helpers (getWidget, isCompact, ...) live in web/index.js (re-exported
from widgets.js / utils.js / graph-traversal.js). Node files must import them
instead of redefining them locally. Files with a deliberately different local
copy carry a `NOTE: local <name> kept intentionally` comment and are allowed.

Usage:
    python tools/audit_js_utils.py --fail-on-missing
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

GUARDED_NAMES = (
    "getWidget",
    "isCompact",
    "setCompact",
    "isNodeCollapsed",
    "forceRedraw",
    "findNodeById",
    "getAllGraphs",
    "parsePositiveInt",
)

# Matches function-like local definitions only:
#   function NAME( ... )
#   const|let NAME = ( ... ) => ... / = x => ... / = function ... / = async ...
# Plain value bindings (const isCompact = !!...) and pure aliases
# (const parsePositiveInt = sharedParsePositiveInt;) are NOT definitions.
DEF_RE = re.compile(
    r"^(?!\s*export\s)\s*(?:function\s+(?P<fn>\w+)\s*\(|"
    r"(?:const|let)\s+(?P<var>\w+)\s*=\s*(?:async\s+)?"
    r"(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>))"
)


def _has_keep_marker(text: str, name: str) -> bool:
    return re.search(r"NOTE:\s*local[^\n]*\b" + re.escape(name) + r"\b", text) is not None


def _local_defs(path: Path) -> list[str]:
    found: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return found
    for line in text.splitlines():
        m = DEF_RE.match(line)
        if not m:
            continue
        name = m.group("fn") or m.group("var")
        if (
            name in GUARDED_NAMES
            and name not in found
            and not _has_keep_marker(text, name)
        ):
            found.append(name)
    return found


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Flag local redefinitions of shared web/ utilities."
    )
    ap.add_argument(
        "--fail-on-missing",
        action="store_true",
        help="Exit non-zero if any unmarked local copies are found.",
    )
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    web_dir = repo_root / "web"
    violations: dict[str, list[str]] = {}
    for js_file in sorted(web_dir.glob("*.js")):
        names = _local_defs(js_file)
        if names:
            violations[js_file.name] = names

    if violations:
        print("JS utils audit: unmarked local copies of shared helpers")
        for filename, names in violations.items():
            print(f"- {filename}: {', '.join(names)}")
            print(
                "  Import from ./index.js instead, or keep the local copy with a "
                "`NOTE: local <name> kept intentionally` comment explaining why."
            )
    else:
        print("JS utils audit: no unmarked local copies. OK.")

    if violations and args.fail_on_missing:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
