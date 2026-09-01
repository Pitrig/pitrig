from __future__ import annotations

import argparse

from ..common import write_or_check
from . import LABEL, OUTPUTS
from .emit import cpp, typescript
from .errors import fail
from .faces import FACES, glyph_count, load_font


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    document = load_font()
    writers = {"cpp": cpp, "typescript": typescript}
    outputs = {path: writers[kind](document) for path, kind in OUTPUTS.items()}
    write_or_check(outputs, args.check, LABEL, fail)

    sizes = ", ".join(
        f"{name} {document['faces'][name]['width']}x{document['faces'][name]['height']}"
        for name in FACES
    )
    print(f"led font: {glyph_count(document)} glyphs, {sizes}")


if __name__ == "__main__":
    main()
