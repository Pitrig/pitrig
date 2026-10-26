from __future__ import annotations

from typing import Any

from .constants import CATEGORY_LABELS
from .game_sources import tracked_games


def games_cell(mapping: dict[str, Any], games: dict[str, Any]) -> str:
    sent_by = tracked_games(mapping)
    if sent_by is None:
        return "any"
    return ", ".join(games[game_id]["label"] for game_id in sent_by) or "none"


def generate_markdown(
    document: dict[str, Any],
    fields: list[dict[str, str]],
    mappings: dict[str, dict[str, Any]],
    games: dict[str, Any],
) -> str:
    lines = [
        "# Telemetry catalog",
        "",
        "This file is generated from `telemetry/telemetry_catalog.json`. It documents the bounded, protocol-neutral fields accepted by Pitrig. It does not define SimHub property formulas or game-specific source mappings.",
        "",
        f"Catalog version: {document['version']}. Fields: {len(fields)}. Static limit: {document['maximum_fields']}.",
        "",
        "Games lists which of the games the SimHub plugin reads per game send a field; `any` is every game SimHub reports it for.",
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
                    "| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |",
                    "|---|---:|---|---|---|---|---|---|",
                ]
            )
        description = field["description"].replace("|", "\\|")
        lines.append(
            f"| `{field['name']}` | `{field['wire_id']}` | `{field['type']}` | `{field['unit']}` | `{field['rate']}` | `{field['availability']}` | {games_cell(mappings[field['name']], games)} | {description} |"
        )
    lines.append("")
    return "\n".join(lines)
