from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..common import ROOT
from . import CATALOG_FORMAT, CATALOG_FORMAT_VERSION, METADATA_URL, WEIGHTS
from .errors import fail
from .identifiers import check_identifiers
from .variants import weight_of


def load_json(path: Path, label: str) -> Any:
    if not path.exists():
        fail(f"{label} is missing: {path.relative_to(ROOT)}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{label} is not valid JSON: {error}")


def build_catalog(snapshot: dict[str, Any], selection: dict[str, Any]) -> dict[str, Any]:
    include_italic = bool(selection.get("include_italic", False))
    allowed_weights = set(selection.get("weights") or WEIGHTS)
    excluded = set(selection.get("exclude") or [])
    excluded_categories = set(selection.get("exclude_categories") or [])
    maximum = selection.get("maximum_families")

    families = []
    for entry in snapshot.get("families", []):
        name = entry["family"]
        if name in excluded or entry.get("category") in excluded_categories:
            continue
        variants = [
            variant
            for variant in entry.get("variants", [])
            if weight_of(variant["variant"]) in allowed_weights
            and (include_italic or not variant["variant"].endswith("italic"))
        ]
        if not variants:
            continue
        families.append(
            {
                "name": name,
                "category": entry.get("category", "Other"),
                "variants": [
                    {"variant": v["variant"], "url": v["url"]} for v in variants
                ],
            }
        )

    ranking = {
        entry["family"]: entry.get("popularity") or 10_000
        for entry in snapshot.get("families", [])
    }
    families.sort(key=lambda family: (ranking.get(family["name"], 10_000), family["name"]))
    if isinstance(maximum, int) and maximum > 0:
        families = families[:maximum]

    check_identifiers(families)
    return {
        "format": CATALOG_FORMAT,
        "format_version": CATALOG_FORMAT_VERSION,
        "generated_from": snapshot.get("source", METADATA_URL),
        "families": families,
    }
