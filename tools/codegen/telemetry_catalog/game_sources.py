from __future__ import annotations

import json
from typing import Any

from .constants import GAME_RUNNING
from .errors import fail

CURRENT_GAME = "DataCorePlugin.CurrentGame"
NEW_DATA_SEGMENT = ".GameData.NewData."
SOURCE_KEYS = {"property", "scale", "values", "default", "bit", "clock"}
GENERIC_KEYS = ("property", "expression", "javascript")
HIGHEST_BIT = 31


def validate_games_table(games: Any) -> None:
    if not isinstance(games, dict) or not games:
        fail("SimHub games must be a non-empty object")
    for game_id, game in games.items():
        if not isinstance(game, dict) or set(game) != {"simhub", "label"}:
            fail(f"SimHub game {game_id} must hold exactly simhub and label")


def value_matches(field_type: str, value: Any) -> bool:
    if field_type == "boolean":
        return isinstance(value, bool)
    if field_type == "text":
        return isinstance(value, str)
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_game_source(field: dict[str, str], game_id: str, source: Any) -> None:
    name = field["name"]
    if not isinstance(source, dict) or "property" not in source or not set(source) <= SOURCE_KEYS:
        fail(f"{name} needs a property, and nothing beyond {sorted(SOURCE_KEYS)}, for {game_id}")
    transforms = [key for key in ("scale", "values", "bit", "clock") if key in source]
    if len(transforms) > 1:
        fail(f"{name} combines {transforms} for {game_id}; a source transforms one way")
    if "default" in source and "values" not in source:
        fail(f"{name} sets a default without values for {game_id}")
    if "bit" in source:
        if field["type"] != "boolean" or not isinstance(source["bit"], int):
            fail(f"{name} reads a bit for {game_id} into a field that is not boolean")
        if not 0 <= source["bit"] <= HIGHEST_BIT:
            fail(f"{name} reads bit {source['bit']} for {game_id}")
    if "clock" in source and (field["type"] != "text" or source["clock"] is not True):
        fail(f"{name} formats a clock for {game_id} into a field that is not text")
    if "scale" in source and not value_matches("float32", source["scale"]):
        fail(f"{name} scales by a non-number for {game_id}")
    if "values" in source:
        table = source["values"]
        if not isinstance(table, dict) or not table:
            fail(f"{name} maps no values for {game_id}")
        candidates = list(table.values()) + ([source["default"]] if "default" in source else [])
        if not all(value_matches(field["type"], value) for value in candidates):
            fail(f"{name} maps values of the wrong type for {game_id}")


def validate_game_sources(
    field: dict[str, str], mapping: dict[str, Any], games: dict[str, Any]
) -> None:
    generic = any(key in mapping for key in GENERIC_KEYS)
    sources = mapping.get("games")
    if sources is None:
        if not generic:
            fail(f"SimHub mapping without a source must list its games: {field['name']}")
        return
    if not isinstance(sources, dict):
        fail(f"SimHub games of {field['name']} must be an object")
    for game_id, source in sources.items():
        if game_id not in games:
            fail(f"{field['name']} names an unknown game {game_id}")
        if source is True:
            if not generic:
                fail(f"{field['name']} sends {game_id} through a generic source it lacks")
            continue
        if "expression" in mapping or "javascript" in mapping or "computed" in mapping:
            fail(f"{field['name']} mixes a formula with a source for {game_id}")
        validate_game_source(field, game_id, source)


def has_game_sources(mapping: dict[str, Any]) -> bool:
    return any(isinstance(source, dict) for source in mapping.get("games", {}).values())


def tracked_games(mapping: dict[str, Any]) -> list[str] | None:
    sources = mapping.get("games")
    return None if sources is None else list(sources)


def javascript_read(property_name: str) -> str:
    read = f"$prop({json.dumps(property_name)})"
    if NEW_DATA_SEGMENT not in property_name:
        return read
    fallback = property_name.replace(NEW_DATA_SEGMENT, ".GameData.", 1)
    return (
        f"(function (value) {{ return value === null || value === undefined ? "
        f"$prop({json.dumps(fallback)}) : value; }})({read})"
    )


def javascript_scaled(read: str, scale: Any) -> str:
    return (
        f"(function (value) {{ return value === null || value === undefined || value === '' ? "
        f"null : Number(value) * {scale}; }})({read})"
    )


def javascript_source(source: dict[str, Any]) -> str:
    read = f"$prop({json.dumps(source['property'])})"
    if "bit" in source:
        return (
            "(function (value) { return value === null || value === undefined ? null : "
            f"Math.floor(Number(value) / {2 ** source['bit']}) % 2 === 1; }})({read})"
        )
    if "values" in source:
        table = json.dumps(source["values"], ensure_ascii=False)
        default = json.dumps(source.get("default"), ensure_ascii=False)
        return (
            "(function (value) { if (value === null || value === undefined) return null; "
            "const key = typeof value === 'boolean' ? (value ? '1' : '0') : String(value); "
            f"const table = {table}; "
            f"return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : {default}; }})({read})"
        )
    if "clock" in source:
        return (
            "(function (value) { if (value === null || value === undefined || !isFinite(value) || "
            "Number(value) < 0) return null; const minutes = Math.floor(Number(value) / 60); "
            "const pad = function (number) { return (number < 10 ? '0' : '') + number; }; "
            f"return pad(Math.floor(minutes / 60) % 24) + ':' + pad(minutes % 60); }})({read})"
        )
    if "scale" in source:
        return javascript_scaled(read, source["scale"])
    return read


def javascript_generic(mapping: dict[str, Any]) -> str:
    if "property" not in mapping:
        return "null"
    read = javascript_read(mapping["property"])
    return javascript_scaled(read, mapping["scale"]) if "scale" in mapping else read


def with_game_javascript(mapping: dict[str, Any], games: dict[str, Any]) -> dict[str, Any]:
    if not has_game_sources(mapping):
        return mapping
    derived = {
        key: value for key, value in mapping.items() if key not in ("property", "scale", "games")
    }
    branches = [
        f"case {json.dumps(games[game_id]['simhub'])}: return {javascript_source(source)};"
        for game_id, source in mapping["games"].items()
        if isinstance(source, dict)
    ]
    branches.append(f"default: return {javascript_generic(mapping)};")
    derived["javascript"] = (
        f"if (!$prop('{GAME_RUNNING}')) return null; "
        f"switch ($prop('{CURRENT_GAME}')) {{ {' '.join(branches)} }}"
    )
    return derived


def silent_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    if any(key in mapping for key in GENERIC_KEYS) or has_game_sources(mapping):
        return mapping
    derived = {key: value for key, value in mapping.items() if key != "games"}
    derived["javascript"] = "return null;"
    return derived
