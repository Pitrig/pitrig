from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parents[2]


def fail_with(label: str) -> Callable[[str], NoReturn]:
    def fail(message: str) -> NoReturn:
        print(f"{label} error: {message}", file=sys.stderr)
        raise SystemExit(1)

    return fail


def write_or_check(
    outputs: dict[Path, str],
    check: bool,
    label: str,
    fail: Callable[[str], NoReturn],
) -> None:
    stale = []
    for path, content in outputs.items():
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(path.relative_to(ROOT))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    if stale:
        fail(f"generated {label} files are stale: " + ", ".join(map(str, stale)))
