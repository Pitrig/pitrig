#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "telemetry" / "telemetry_catalog.json"
SIMHUB_MAPPINGS_SOURCE = ROOT / "telemetry" / "simhub_generic_mappings.json"
OUTPUTS = {
    ROOT
    / "firmware/services/telemetry/include/telemetry_catalog_generated.hpp": "cpp",
    ROOT
    / "firmware/services/telemetry/protocols/simhub/include/simhub_catalog_generated.hpp": "simhub",
    ROOT / "configurator/src/shared/telemetry-catalog.ts": "typescript",
    ROOT / "configurator/src/shared/simhub-profile-data.ts": "simhub_typescript",
    ROOT / "docs/telemetry-catalog.md": "markdown",
    ROOT / "simhub/SimCore-telemetry.shsds": "shsds",
}

VALID_TYPES = {"text", "uint32", "int32", "float32", "boolean"}
VALID_RATES = {"fast", "normal", "slow", "changes"}
VALID_AVAILABILITY = {
    "common",
    "optional",
    "computed",
    "game_specific",
}
VALID_SIMHUB_CONVERSIONS = {"number", "text", "boolean", "timespan_ms"}
WIRE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
CANONICAL_NAME_CAPACITY = 40
WHEEL_LABELS = {
    "front_left": "front-left",
    "front_right": "front-right",
    "rear_left": "rear-left",
    "rear_right": "rear-right",
}
CATEGORY_LABELS = {
    "speed_control": "Speed and controls",
    "engine": "Engine",
    "transmission": "Transmission",
    "laps_sectors": "Laps and sectors",
    "session_position": "Session and position",
    "fuel_energy": "Fuel and energy",
    "electronics_state": "Electronics and vehicle state",
    "flags_messages": "Flags and messages",
    "tyres": "Tyres",
    "brakes_suspension": "Brakes and suspension",
    "track_weather": "Track and weather",
    "motion_physics": "Motion and vehicle physics",
}


def load_catalog() -> tuple[dict[str, Any], list[dict[str, str]]]:
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    fields = [dict(field) for field in document["fields"]]
    wheels = document["wheels"]
    for family in document["wheel_families"]:
        for wheel in wheels:
            expanded = dict(family)
            expanded["name"] = family["name"].format(wheel=wheel)
            expanded["description"] = family["description"].format(
                wheel_label=WHEEL_LABELS[wheel]
            )
            fields.append(expanded)

    expected = document["expected_field_count"]
    maximum = document["maximum_fields"]
    if len(fields) != expected:
        fail(f"expected {expected} fields, expanded {len(fields)}")
    if len(fields) > maximum:
        fail(f"expanded catalog exceeds maximum field count {maximum}")

    names: set[str] = set()
    identifiers: set[str] = set()
    for field in fields:
        validate_field(field)
        name = field["name"]
        if name in names:
            fail(f"duplicate canonical field name: {name}")
        names.add(name)
        identifier = field.get("wire_id")
        if identifier is not None:
            validate_identifier(identifier)
            if identifier in identifiers:
                fail(f"duplicate SimHub wire identifier: {identifier}")
            identifiers.add(identifier)

    next_identifier = 0
    for field in fields:
        if "wire_id" in field:
            continue
        while True:
            identifier = automatic_identifier(next_identifier)
            next_identifier += 1
            if identifier not in identifiers:
                break
        field["wire_id"] = identifier
        identifiers.add(identifier)

    return document, fields


def load_simhub_mappings(
    document: dict[str, Any], fields: list[dict[str, str]]
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    mappings = json.loads(SIMHUB_MAPPINGS_SOURCE.read_text(encoding="utf-8"))
    scalar_names = {field["name"] for field in document["fields"]}
    family_names = {family["name"] for family in document["wheel_families"]}
    if set(mappings["fields"]) != scalar_names:
        report_key_mismatch("SimHub scalar mappings", scalar_names, set(mappings["fields"]))
    if set(mappings["wheel_families"]) != family_names:
        report_key_mismatch(
            "SimHub wheel-family mappings",
            family_names,
            set(mappings["wheel_families"]),
        )

    profile = mappings["profile"]
    frequencies = profile["frequencies"]
    if set(frequencies) != VALID_RATES:
        report_key_mismatch("SimHub frequencies", VALID_RATES, set(frequencies))
    if not isinstance(profile["baud_rate"], int) or not 9_600 <= profile["baud_rate"] <= 2_000_000:
        fail("SimHub profile baud_rate must be an integer from 9600 to 2000000")

    expanded = {name: dict(mapping) for name, mapping in mappings["fields"].items()}
    suffixes = mappings["wheel_suffixes"]
    if set(suffixes) != set(document["wheels"]):
        report_key_mismatch("SimHub wheel suffixes", set(document["wheels"]), set(suffixes))
    for family_name, mapping in mappings["wheel_families"].items():
        for wheel in document["wheels"]:
            expanded_name = family_name.format(wheel=wheel)
            expanded_mapping = dict(mapping)
            if "property" in expanded_mapping:
                expanded_mapping["property"] = expanded_mapping["property"].format(
                    suffix=suffixes[wheel]
                )
            if "expression" in expanded_mapping:
                expanded_mapping["expression"] = expanded_mapping["expression"].format(
                    suffix=suffixes[wheel]
                )
            expanded[expanded_name] = expanded_mapping

    field_names = {field["name"] for field in fields}
    if set(expanded) != field_names:
        report_key_mismatch("expanded SimHub mappings", field_names, set(expanded))
    for field in fields:
        validate_simhub_mapping(field, expanded[field["name"]])
    return profile, expanded


def report_key_mismatch(label: str, expected: set[str], actual: set[str]) -> None:
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    fail(f"{label} mismatch; missing={missing}, extra={extra}")


def validate_simhub_mapping(field: dict[str, str], mapping: dict[str, Any]) -> None:
    sources = int("property" in mapping) + int("expression" in mapping)
    if sources != 1:
        fail(f"SimHub mapping must define exactly one property or expression: {field['name']}")
    conversion = mapping.get("conversion", "number")
    if conversion not in VALID_SIMHUB_CONVERSIONS:
        fail(f"invalid SimHub conversion for {field['name']}: {conversion}")
    expected_conversion = {"boolean": "boolean"}.get(field["type"])
    if expected_conversion is not None and conversion != expected_conversion:
        fail(
            f"SimHub conversion for {field['name']} must be {expected_conversion}, got {conversion}"
        )
    if conversion == "number" and "format" not in mapping:
        fail(f"numeric SimHub mapping requires a format: {field['name']}")
    if "scale" in mapping and not isinstance(mapping["scale"], (int, float)):
        fail(f"SimHub mapping scale must be numeric: {field['name']}")


def validate_field(field: dict[str, str]) -> None:
    required = {
        "name",
        "type",
        "unit",
        "category",
        "rate",
        "availability",
        "description",
    }
    missing = required - field.keys()
    if missing:
        fail(f"field is missing properties {sorted(missing)}: {field}")
    if len(field["name"].encode("utf-8")) >= CANONICAL_NAME_CAPACITY:
        fail(
            "canonical field name exceeds "
            f"{CANONICAL_NAME_CAPACITY - 1} bytes: {field['name']}"
        )
    if field["type"] not in VALID_TYPES:
        fail(f"invalid type for {field['name']}: {field['type']}")
    if field["rate"] not in VALID_RATES:
        fail(f"invalid rate for {field['name']}: {field['rate']}")
    if field["availability"] not in VALID_AVAILABILITY:
        fail(
            f"invalid availability for {field['name']}: {field['availability']}"
        )
    if field["category"] not in CATEGORY_LABELS:
        fail(f"invalid category for {field['name']}: {field['category']}")


def validate_identifier(identifier: str) -> None:
    if len(identifier) not in (1, 2) or not identifier.isascii():
        fail(f"wire identifier must contain one or two ASCII characters: {identifier}")
    if not all(character.isalnum() for character in identifier):
        fail(f"wire identifier must be alphanumeric: {identifier}")


def automatic_identifier(index: int) -> str:
    capacity = len(WIRE_ALPHABET) ** 2
    if index >= capacity:
        fail("automatic SimHub wire identifier space exhausted")
    high, low = divmod(index, len(WIRE_ALPHABET))
    return WIRE_ALPHABET[high] + WIRE_ALPHABET[low]


def generate_cpp(document: dict[str, Any], fields: list[dict[str, str]]) -> str:
    descriptors = "\n".join(
        f'    {{"{field["name"]}", ValueType::{field["type"]}}},'
        for field in fields
    )
    return f"""// Generated by tools/generate_telemetry_catalog.py. Do not edit.
#pragma once

namespace simcore::telemetry::catalog {{

inline constexpr std::size_t kFieldCount = {len(fields)};
inline constexpr std::size_t kMaximumFieldCount = {document['maximum_fields']};

inline constexpr std::array<FieldDescriptor, kFieldCount> kFieldDescriptors{{{{
{descriptors}
}}}};

static_assert(kFieldCount <= kMaximumFieldCount);

}}
"""


def generate_simhub(_document: dict[str, Any], fields: list[dict[str, str]]) -> str:
    descriptors = "\n".join(
        f'    {{"{field["wire_id"]}", "{field["name"]}"}},' for field in fields
    )
    lookup = sorted(
        (
            identifier_key(field["wire_id"]),
            index,
        )
        for index, field in enumerate(fields)
    )
    lookup_entries = "\n".join(
        f"    {{{key}, {index}}}," for key, index in lookup
    )
    return f"""// Generated by tools/generate_telemetry_catalog.py. Do not edit.
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace simcore::protocols::simhub_catalog {{

struct BindingDescriptor {{
  std::string_view identifier;
  std::string_view canonical_name;
}};

struct LookupEntry {{
  std::uint16_t key;
  std::uint16_t binding_index;
}};

inline constexpr std::array<BindingDescriptor, {len(fields)}> kBindings{{{{
{descriptors}
}}}};

inline constexpr std::array<LookupEntry, {len(fields)}> kLookup{{{{
{lookup_entries}
}}}};

}}
"""


def identifier_key(identifier: str) -> int:
    first = ord(identifier[0])
    second = ord(identifier[1]) if len(identifier) == 2 else 0
    return (first << 8) | second


def generate_typescript(
    _document: dict[str, Any], fields: list[dict[str, str]]
) -> str:
    records = []
    for field in fields:
        record = {
            "name": field["name"],
            "wireId": field["wire_id"],
            "type": field["type"],
            "unit": field["unit"],
            "category": field["category"],
            "categoryLabel": CATEGORY_LABELS[field["category"]],
            "rate": field["rate"],
            "availability": field["availability"],
            "description": field["description"],
        }
        records.append("  " + json.dumps(record, ensure_ascii=False, separators=(",", ":")))
    body = ",\n".join(records)
    return f"""// Generated by tools/generate_telemetry_catalog.py. Do not edit.

export type TelemetryValueType = 'text' | 'uint32' | 'int32' | 'float32' | 'boolean'
export type TelemetryRate = 'fast' | 'normal' | 'slow' | 'changes'
export type TelemetryAvailability = 'common' | 'optional' | 'computed' | 'game_specific'

export interface TelemetryCatalogEntry {{
  name: string
  wireId: string
  type: TelemetryValueType
  unit: string
  category: string
  categoryLabel: string
  rate: TelemetryRate
  availability: TelemetryAvailability
  description: string
}}

export const TELEMETRY_CATALOG = [
{body}
] as const satisfies readonly TelemetryCatalogEntry[]
"""


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


def generate_simhub_expression(
    field: dict[str, str], mapping: dict[str, Any]
) -> str:
    identifier = field["wire_id"]
    source = mapping.get("expression")
    if source is None:
        property_name = mapping["property"]
        source = f"[{property_name}]"
        new_data_segment = ".GameData.NewData."
        if new_data_segment in property_name:
            normalized_name = property_name.replace(
                new_data_segment, ".GameData.", 1
            )
            source = f"isnull({source}, [{normalized_name}])"
    conversion = mapping.get("conversion", "number")
    fallback = mapping.get("fallback")
    if conversion == "timespan_ms":
        converted = f"format(timespantoseconds({source}) * 1000, '0')"
    elif conversion == "boolean":
        converted = f"if({source}, '1', '0')"
    elif conversion == "text":
        converted = f"replace(replace('' + {source}, '\\r', ' '), '\\n', ' ')"
    else:
        scaled = source
        if "scale" in mapping:
            scaled = f"({source}) * {mapping['scale']}"
        converted = f"format({scaled}, '{mapping['format']}')"

    unavailable = f"'' + isnull({source}, '') = ''"
    if fallback is not None:
        converted = f"if({unavailable}, '{fallback}', {converted})"
        return f"'{identifier};' + {converted} + '\\n'"
    return (
        f"if({unavailable}, '{identifier};\\n', "
        f"'{identifier};' + {converted} + '\\n')"
    )


def generate_shsds(
    profile: dict[str, Any],
    fields: list[dict[str, str]],
    mappings: dict[str, dict[str, Any]],
) -> str:
    update_messages = []
    for field in fields:
        update_messages.append(
            {
                "Message": {
                    "Expression": generate_simhub_expression(
                        field, mappings[field["name"]]
                    )
                },
                "IsEnabled": True,
                "MaximumFrequency": profile["frequencies"][field["rate"]],
            }
        )
    document = {
        "AutomaticReconnect": True,
        "SerialPortName": "",
        "StartupDelayMs": 0,
        "IsConnecting": False,
        "IsEnabled": True,
        "LogIncomingData": False,
        "IsConnected": False,
        "BaudRate": profile["baud_rate"],
        "DtrEnable": False,
        "RtsEnable": False,
        "EditorExpanded": True,
        "Name": profile["name"],
        "Description": profile["description"],
        "LastErrorDate": "0001-01-01T00:00:00+00:00",
        "LastErrorMessage": None,
        "IsFreezed": False,
        "SettingsBuilder": {"Settings": [], "IsEditMode": False},
        "OnConnectMessage": {"Expression": ""},
        "OnDisconnectMessage": {"Expression": ""},
        "UpdateMessages": update_messages,
    }
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def generate_simhub_typescript(
    profile: dict[str, Any],
    fields: list[dict[str, str]],
    mappings: dict[str, dict[str, Any]],
) -> str:
    defaults = {
        "name": profile["name"],
        "description": profile["description"],
        "baudRate": profile["baud_rate"],
    }
    records = []
    for field in fields:
        record = {
            "name": field["name"],
            "expression": generate_simhub_expression(
                field, mappings[field["name"]]
            ),
            "maximumFrequency": profile["frequencies"][field["rate"]],
        }
        records.append(
            "  " + json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        )
    body = ",\n".join(records)
    defaults_json = json.dumps(defaults, ensure_ascii=False, separators=(",", ":"))
    return f"""// Generated by tools/generate_telemetry_catalog.py. Do not edit.

export interface SimHubProfileEntry {{
  name: string
  expression: string
  maximumFrequency: number
}}

export const SIMHUB_PROFILE_DEFAULTS = {defaults_json} as const

export const SIMHUB_PROFILE_ENTRIES = [
{body}
] as const satisfies readonly SimHubProfileEntry[]
"""


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
        elif kind == "simhub_typescript":
            outputs[path] = generate_simhub_typescript(
                simhub_profile, fields, simhub_mappings
            )
        else:
            outputs[path] = generators[kind](document, fields)
    return outputs


def write_or_check(outputs: dict[Path, str], check: bool) -> None:
    stale = []
    for path, content in outputs.items():
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(path.relative_to(ROOT))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    if stale:
        fail("generated telemetry catalog files are stale: " + ", ".join(map(str, stale)))


def fail(message: str) -> None:
    print(f"telemetry catalog error: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document, fields = load_catalog()
    write_or_check(expected_outputs(document, fields), args.check)
    print(f"telemetry catalog: {len(fields)} fields")


if __name__ == "__main__":
    main()
