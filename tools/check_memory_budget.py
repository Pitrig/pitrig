#!/usr/bin/env python3
"""Fail when a firmware image takes more static memory than its board allows.

The ceilings in memory_budget.json are what each board is known to run with:
internal RAM above them has stopped a display from starting (ADR 0026), so a
build that crosses one stops here rather than on the board.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUDGET = ROOT / "tools" / "memory_budget.json"

MEASURES = {
    "internal_ram": "DIRAM",
    "external_ram": "External RAM",
}


def fail(message: str) -> None:
    print(f"memory budget error: {message}", file=sys.stderr)
    raise SystemExit(1)


def board_of(build: Path, boards: dict) -> tuple[str, str]:
    sdkconfig = build / "config" / "sdkconfig.json"
    if not sdkconfig.is_file():
        fail(f"{sdkconfig} is missing; build {build} first")
    config = json.loads(sdkconfig.read_text(encoding="utf-8"))
    variant = "debug" if config.get("PITRIG_DEBUG") else "product"
    for name, board in boards.items():
        if config.get(board["sdkconfig"]):
            return name, variant
    fail(f"{build} names no board listed in {BUDGET.name}")
    return "", ""


def measure(build: Path) -> dict[str, int]:
    link_map = build / "pitrig.map"
    if not link_map.is_file():
        fail(f"{link_map} is missing; build {build} first")
    result = subprocess.run(
        [sys.executable, "-m", "esp_idf_size", "--format", "json2", str(link_map)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        fail(f"esp_idf_size failed on {link_map}; source the ESP-IDF environment first")
    report = json.loads(result.stdout)
    used = {layout["name"]: layout["used"] for layout in report["layout"]}
    sizes = {key: used.get(name, 0) for key, name in MEASURES.items()}
    sizes["image"] = report["total_size"]
    return sizes


def check(build: Path, boards: dict) -> bool:
    name, variant = board_of(build, boards)
    ceilings = boards[name][variant]
    sizes = measure(build)
    within = True
    parts = []
    for key, size in sizes.items():
        ceiling = ceilings[key]
        if size > ceiling:
            within = False
        parts.append(f"{key} {size:,} of {ceiling:,} ({ceiling - size:+,})")
    status = "ok" if within else "OVER"
    print(f"{build.name} [{name} {variant}] {status}: " + ", ".join(parts))
    return within


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("builds", nargs="+", type=Path)
    args = parser.parse_args()

    if not BUDGET.is_file():
        fail(f"{BUDGET} is missing")
    boards = json.loads(BUDGET.read_text(encoding="utf-8"))["boards"]

    results = [check(build, boards) for build in args.builds]
    if not all(results):
        fail("an image is over its board's budget; free the memory or measure the board "
             "and raise the ceiling in tools/memory_budget.json")


if __name__ == "__main__":
    main()
