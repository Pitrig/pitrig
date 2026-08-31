from __future__ import annotations

import argparse
import json

from ..common import write_or_check
from . import OUTPUT, SELECTION, SNAPSHOT
from .catalog import build_catalog, load_json
from .errors import LABEL, fail
from .fetch import refresh_snapshot


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="re-fetch the snapshot from Google before generating",
    )
    args = parser.parse_args()

    if args.refresh:
        if args.check:
            fail("--refresh rewrites the snapshot, so it cannot be combined with --check")
        snapshot = refresh_snapshot()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(
            json.dumps(snapshot, indent=1, sort_keys=False) + "\n", encoding="utf-8"
        )

    snapshot = load_json(SNAPSHOT, "the Google Fonts snapshot")
    selection = load_json(SELECTION, "the Google Fonts selection")
    catalog = build_catalog(snapshot, selection)
    write_or_check(
        {OUTPUT: json.dumps(catalog, indent=1) + "\n"}, args.check, LABEL, fail
    )
    variants = sum(len(family["variants"]) for family in catalog["families"])
    print(f"font catalog: {len(catalog['families'])} families, {variants} faces")


if __name__ == "__main__":
    main()
