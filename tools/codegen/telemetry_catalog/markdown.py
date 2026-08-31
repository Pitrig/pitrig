from __future__ import annotations

from typing import Any

from .constants import CATEGORY_LABELS


def generate_markdown(
    document: dict[str, Any], fields: list[dict[str, str]]
) -> str:
    lines = [
        "# Telemetry catalog",
        "",
        "This file is generated from `telemetry/telemetry_catalog.json`. It documents the bounded, protocol-neutral fields accepted by SimCore. It does not define SimHub property formulas or game-specific source mappings.",
        "",
        f"Catalog version: {document['version']}. Fields: {len(fields)}. Static limit: {document['maximum_fields']}.",
        "",
    ]
    current_category = None
    for field in fields:
        category = field["category"]
        if category != current_category:
            current_category = category
            lines.extend(
                [
                    f"## {CATEGORY_LABELS[category]}",
                    "",
                    "| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |",
                    "|---|---:|---|---|---|---|---|",
                ]
            )
        description = field["description"].replace("|", "\\|")
        lines.append(
            f"| `{field['name']}` | `{field['wire_id']}` | `{field['type']}` | `{field['unit']}` | `{field['rate']}` | `{field['availability']}` | {description} |"
        )
    lines.append("")
    return "\n".join(lines)
