from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from ..common import write_or_check
from . import OUTPUTS
from .catalog import load_catalog, load_simhub_mappings
from .cpp import generate_cpp
from .csharp import generate_csharp
from .errors import LABEL, fail
from .markdown import generate_markdown
from .simhub import generate_shsds, generate_simhub, generate_simhub_typescript
from .typescript import generate_typescript


def expected_outputs(
    document: dict[str, Any], fields: list[dict[str, str]]
) -> dict[Path, str]:
    simhub_profile, simhub_mappings = load_simhub_mappings(document, fields)
    generators = {
        "cpp": generate_cpp,
        "simhub": generate_simhub,
        "typescript": generate_typescript,
        "markdown": generate_markdown,
    }
    outputs = {}
    for path, kind in OUTPUTS.items():
        if kind == "shsds":
            outputs[path] = generate_shsds(simhub_profile, fields, simhub_mappings)
        elif kind == "csharp":
            outputs[path] = generate_csharp(simhub_profile, fields, simhub_mappings)
        elif kind == "simhub_typescript":
            outputs[path] = generate_simhub_typescript(
                simhub_profile, fields, simhub_mappings
            )
        else:
            outputs[path] = generators[kind](document, fields)
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document, fields = load_catalog()
    write_or_check(expected_outputs(document, fields), args.check, LABEL, fail)
    print(f"telemetry catalog: {len(fields)} fields")


if __name__ == "__main__":
    main()
