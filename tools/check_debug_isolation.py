#!/usr/bin/env python3
"""Guard the boundary between the product firmware and its debug build.

Every debug implementation lives under firmware/debug/, which a production build
registers as empty components. What stays in production code is a small set of
one-line hooks behind SIMCORE_DEBUG. This records how many hooks each production
file carries, so a new one cannot appear unnoticed.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIRMWARE = ROOT / "firmware"
DEBUG_TREE = FIRMWARE / "debug"
ALLOWLIST = ROOT / "tools" / "debug_hooks.json"

SOURCE_SUFFIXES = {".c", ".h", ".cpp", ".hpp"}
BUILD_PREFIX = "build"
ALIAS_HEADER = "utils/simcore_config/include/simcore_features.hpp"
HOOK = re.compile(
    r"SIMCORE_DEBUG_OVERLAY\b|SIMCORE_LAYOUT_DEBUG\b|SIMCORE_DEBUG\b"
)


def fail(message: str) -> None:
    print(f"debug isolation error: {message}", file=sys.stderr)
    raise SystemExit(1)


def production_sources() -> list[Path]:
    sources = []
    for path in sorted(FIRMWARE.rglob("*")):
        if path.suffix not in SOURCE_SUFFIXES or not path.is_file():
            continue
        relative = path.relative_to(FIRMWARE)
        if relative.parts[0].startswith(BUILD_PREFIX):
            continue
        if relative.parts[0] in {"managed_components", "debug"}:
            continue
        if relative.as_posix() == ALIAS_HEADER:
            continue
        sources.append(path)
    return sources


def collect() -> dict[str, int]:
    hooks: dict[str, int] = {}
    for path in production_sources():
        text = path.read_text(encoding="utf-8", errors="replace")
        count = len(HOOK.findall(text))
        if count:
            hooks[path.relative_to(ROOT).as_posix()] = count
    return hooks


def describe(hooks: dict[str, int]) -> str:
    return json.dumps({"hooks": hooks}, indent=1) + "\n"


def report(current: dict[str, int], recorded: dict[str, int]) -> None:
    added = sorted(set(current) - set(recorded))
    removed = sorted(set(recorded) - set(current))
    changed = sorted(
        name
        for name in set(current) & set(recorded)
        if current[name] != recorded[name]
    )
    for name in added:
        print(f"  new debug hook in production code: {name} ({current[name]})")
    for name in removed:
        print(f"  debug hooks gone: {name}")
    for name in changed:
        print(f"  hook count changed: {name} {recorded[name]} -> {current[name]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not DEBUG_TREE.is_dir():
        fail(f"{DEBUG_TREE} is missing")

    current = collect()
    content = describe(current)

    if args.check:
        if not ALLOWLIST.exists():
            fail(f"{ALLOWLIST} is missing; run the tool without --check")
        recorded = json.loads(ALLOWLIST.read_text(encoding="utf-8"))["hooks"]
        if recorded != current:
            report(current, recorded)
            fail("production debug hooks differ from the recorded set")
    else:
        ALLOWLIST.write_text(content, encoding="utf-8")

    files = len(current)
    total = sum(current.values())
    print(f"debug isolation: {total} hooks across {files} production files")


if __name__ == "__main__":
    main()
