from __future__ import annotations

import json
from typing import Any

from . import SIMHUB_MAPPINGS_SOURCE, SOURCE
from .constants import VALID_RATES, WHEEL_LABELS
from .errors import fail
from .validate import (
    automatic_identifier,
    report_key_mismatch,
    validate_field,
    validate_identifier,
    validate_link,
    validate_simhub_mapping,
)


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
    validate_link(profile["link"])

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
