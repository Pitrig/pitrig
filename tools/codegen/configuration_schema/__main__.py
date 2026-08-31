from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from ..common import write_or_check
from . import OUTPUTS
from .cpp_contract import generate_cpp_contract
from .cpp_parser import generate_cpp_parser
from .errors import LABEL, fail
from .markdown import generate_markdown
from .schema import load_schema
from .typescript import generate_typescript


def expected_outputs(document: dict[str, Any]) -> dict[Path, str]:
    generators = {
        "cpp_contract": generate_cpp_contract,
        "cpp_parser": generate_cpp_parser,
        "typescript": generate_typescript,
        "markdown": generate_markdown,
    }
    return {path: generators[kind](document) for path, kind in OUTPUTS.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = load_schema()
    write_or_check(expected_outputs(document), args.check, LABEL, fail)
    structs = len(document["structs"])
    enums = len(document["enums"])
    print(
        f"configuration schema: version {document['schema_version']}, "
        f"{structs} objects, {enums} enumerations"
    )


if __name__ == "__main__":
    main()
