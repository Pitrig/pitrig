from __future__ import annotations

import argparse

from ..common import write_or_check
from . import LABEL, OUTPUTS
from .emit import cpp, csharp, typescript
from .errors import fail
from .scan import hand_written
from .source import load_prefixes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    prefixes = load_prefixes()
    writers = {"cpp": cpp, "typescript": typescript, "csharp": csharp}
    outputs = {path: writers[kind](prefixes) for path, kind in OUTPUTS.items()}
    write_or_check(outputs, args.check, LABEL, fail)

    found = hand_written(prefixes)
    if found:
        fail(
            "protocol prefixes written by hand; use the generated constants:\n  "
            + "\n  ".join(found)
        )
    print(f"control protocol: {', '.join(prefix.value for prefix in prefixes)}")


if __name__ == "__main__":
    main()
