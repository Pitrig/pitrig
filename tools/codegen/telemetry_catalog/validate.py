from __future__ import annotations

from typing import Any

from .constants import (
    CANONICAL_NAME_CAPACITY,
    CATEGORY_LABELS,
    PARAMETER_PATTERN,
    UNAVAILABLE_OPERATORS,
    VALID_AVAILABILITY,
    VALID_RATES,
    VALID_SIMHUB_CONVERSIONS,
    VALID_TYPES,
    WIRE_ALPHABET,
)
from .errors import fail
from .formats import validate_format
from .game_sources import validate_game_sources


def report_key_mismatch(label: str, expected: set[str], actual: set[str]) -> None:
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    fail(f"{label} mismatch; missing={missing}, extra={extra}")


def validate_simhub_mapping(
    field: dict[str, str],
    mapping: dict[str, Any],
    games: dict[str, Any],
) -> None:
    if "property" in mapping and "computed" in mapping:
        fail(f"SimHub mapping must define either a property or a computed name: {field['name']}")
    for key in ("expression", "javascript"):
        if key in mapping:
            fail(f"SimHub mapping holds no formula, the plugin computes it: {field['name']}")
    validate_game_sources(field, mapping, games)
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
    if "format" in mapping:
        validate_format(field["name"], mapping["format"])
    if "scale" in mapping and not isinstance(mapping["scale"], (int, float)):
        fail(f"SimHub mapping scale must be numeric: {field['name']}")
    if "unavailable_when" in mapping:
        validate_unavailable_rule(field, mapping, conversion)
    if "unit_property" in mapping:
        validate_unit_property(field, mapping, conversion)


def validate_unit_property(
    field: dict[str, str], mapping: dict[str, Any], conversion: str
) -> None:
    name = field["name"]
    if "property" not in mapping or not isinstance(mapping["unit_property"], str):
        fail(f"unit_property names the SimHub unit of a generic property: {name}")
    if conversion != "number":
        fail(f"unit_property needs a number conversion: {name}")
    if "unit_factors" not in mapping:
        fail(f"no SimHub local units convert into {field['unit']}: {name}")


def validate_local_units(units: Any) -> None:
    if not isinstance(units, dict):
        fail("SimHub local_units must be an object")
    for unit, factors in units.items():
        if not isinstance(factors, dict) or not factors:
            fail(f"SimHub local_units must name the factors into {unit}")
        for value in factors.values():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
                fail(f"SimHub local unit factors into {unit} must be positive numbers")


def validate_unavailable_rule(
    field: dict[str, str], mapping: dict[str, Any], conversion: str
) -> None:
    name = field["name"]
    rule = mapping["unavailable_when"]
    if conversion not in ("number", "timespan_ms"):
        fail(f"unavailable_when needs a number or timespan_ms conversion: {name}")
    if "fallback" in mapping:
        fail(f"unavailable_when cannot be combined with a fallback: {name}")
    if not isinstance(rule, dict) or set(rule) != {"op", "value"}:
        fail(f"unavailable_when must hold exactly op and value: {name}")
    if rule["op"] not in UNAVAILABLE_OPERATORS:
        fail(f"invalid unavailable_when op for {name}: {rule['op']}")
    if isinstance(rule["value"], bool) or not isinstance(rule["value"], (int, float)):
        fail(f"unavailable_when value must be numeric: {name}")


def validate_parameters(parameters: dict[str, Any]) -> None:
    for name, parameter in parameters.items():
        if not PARAMETER_PATTERN.fullmatch("{{" + name + "}}"):
            fail(f"SimHub profile parameter name must be snake_case: {name}")
        if set(parameter) != {"default", "minimum", "maximum"}:
            fail(f"SimHub profile parameter must hold default, minimum and maximum: {name}")
        if not all(isinstance(parameter[key], (int, float)) for key in parameter):
            fail(f"SimHub profile parameter values must be numeric: {name}")
        if not parameter["minimum"] <= parameter["default"] <= parameter["maximum"]:
            fail(f"SimHub profile parameter default must lie within its bounds: {name}")


def validate_link(link: dict[str, Any]) -> None:
    if len(link["magic"]) != 2 or not link["magic"].isascii():
        fail("telemetry link magic must contain two ASCII characters")
    if not 1 <= link["version"] <= 255:
        fail("telemetry link version must be a byte")
    if not 1_024 <= link["port"] <= 65_535:
        fail("telemetry link port must be an unprivileged port number")
    if not 1_024 <= link["source_port"] <= 65_535:
        fail("telemetry link source port must be an unprivileged port number")
    if link["source_port"] == link["port"]:
        fail("telemetry link source port must differ from the listening port")
    if not 64 <= link["maximum_payload"] <= 8_192:
        fail("telemetry link payload must be between 64 and 8192 bytes")
    if not 100 <= link["keyframe_interval_ms"] <= 10_000:
        fail("telemetry link keyframe interval must be between 100 and 10000 ms")


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
