from __future__ import annotations

import re
import subprocess
from pathlib import Path

from ..common import ROOT
from . import OUTPUTS, SCANNED
from .source import Prefix

SPELLED = re.compile(r"'@'\s*,\s*'[A-Z]'\s*,\s*'[A-Z]'\s*,\s*':'")


def _files(directory: str, suffixes: tuple[str, ...]) -> list[Path]:
    listed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", directory],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    generated = {path.relative_to(ROOT).as_posix() for path in OUTPUTS}
    return [
        ROOT / name
        for name in listed
        if name.endswith(suffixes) and name not in generated and (ROOT / name).is_file()
    ]


def hand_written(prefixes: list[Prefix]) -> list[str]:
    values = [prefix.value for prefix in prefixes]
    found = []
    for directory, suffixes in SCANNED.items():
        for path in _files(directory, suffixes):
            text = path.read_text(encoding="utf-8", errors="replace")
            for number, line in enumerate(text.splitlines(), start=1):
                if any(value in line for value in values) or SPELLED.search(line):
                    found.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    return found
