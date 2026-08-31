from __future__ import annotations

import json
from typing import Any

from ..common import ROOT
from . import SOURCE
from .errors import fail
from .model import bound
from .scalars import SCALAR_CPP, SCALAR_RANGES


def load_schema() -> dict[str, Any]:
    if not SOURCE.exists():
        fail(f"missing source document {SOURCE.relative_to(ROOT)}")
    try:
        document = json.loads(SOURCE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{SOURCE.relative_to(ROOT)} is not valid JSON: {error}")
    validate_schema(document)
    return document


def validate_schema(document: dict[str, Any]) -> None:
    for key in (
        "schema_version",
        "documents",
        "limits",
        "enums",
        "structs",
        "validation_errors",
    ):
        if key not in document:
            fail(f"missing top-level key '{key}'")
    if not isinstance(document["schema_version"], int):
        fail("schema_version must be an integer")

    limits = document["limits"]
    structs = document["structs"]
    enums = document["enums"]
    externals = document.get("external_types", {})
    constants = document.get("constants", {})

    roots = [name for name, body in structs.items() if body.get("root")]
    if len(roots) != 1:
        fail(f"exactly one struct must be marked root, found {len(roots)}")

    known_scalars = set(SCALAR_CPP) | {"text"}
    for struct_name, body in structs.items():
        seen: set[str] = set()
        for field in body.get("fields", []):
            name = field.get("name")
            if not name:
                fail(f"{struct_name}: field without a name")
            if name in seen:
                fail(f"{struct_name}: duplicate field '{name}'")
            seen.add(name)
            kind = field.get("kind")
            if kind in known_scalars:
                continue
            if kind == "enum":
                if field.get("enum") not in enums:
                    fail(f"{struct_name}.{name}: unknown enum '{field.get('enum')}'")
            elif kind == "struct":
                if field.get("struct") not in structs:
                    fail(f"{struct_name}.{name}: unknown struct '{field.get('struct')}'")
            elif kind == "array":
                if field.get("struct") not in structs:
                    fail(f"{struct_name}.{name}: unknown struct '{field.get('struct')}'")
                if field.get("capacity") not in limits:
                    fail(f"{struct_name}.{name}: unknown capacity '{field.get('capacity')}'")
                if field.get("count_field") not in seen | {
                    other.get("name") for other in body.get("fields", [])
                }:
                    fail(f"{struct_name}.{name}: unknown count_field")
            elif kind == "external":
                if field.get("external") not in externals:
                    fail(f"{struct_name}.{name}: unknown external '{field.get('external')}'")
            else:
                fail(f"{struct_name}.{name}: unknown kind '{kind}'")
            if kind == "text" and field.get("capacity") not in limits:
                fail(f"{struct_name}.{name}: unknown capacity '{field.get('capacity')}'")
            for edge in ("minimum", "maximum"):
                bound = field.get(edge)
                if bound is None:
                    continue
                if kind not in SCALAR_RANGES:
                    fail(f"{struct_name}.{name}: '{edge}' needs a bounded integer kind")
                if isinstance(bound, str) and bound not in limits:
                    fail(f"{struct_name}.{name}: '{edge}' names unknown limit '{bound}'")
            if field.get("zero_means_off") and field.get("minimum") in (None, 0):
                fail(f"{struct_name}.{name}: 'zero_means_off' needs a minimum above zero")

    for name, body in enums.items():
        values = body.get("json_values")
        if not values:
            fail(f"enum {name} has no values")
        if body.get("default") not in values:
            fail(f"enum {name}: default '{body.get('default')}' is not one of its values")

    for name, body in constants.items():
        if "value" not in body:
            fail(f"constant {name} has no value")

    sections = [
        field["name"]
        for field in structs[roots[0]].get("fields", [])
        if field.get("serialized", True) and not field.get("flatten")
    ]
    claimed: dict[str, str] = {}
    for name, body in document["documents"].items():
        if not body.get("sections"):
            fail(f"document {name} owns no section")
        payload = body.get("max_payload")
        if not isinstance(payload, int) or payload <= 0:
            fail(f"document {name}: 'max_payload' must be a positive integer")
        if payload > limits["kMaximumPayloadSize"]["value"]:
            fail(f"document {name}: 'max_payload' exceeds kMaximumPayloadSize")
        if not isinstance(body.get("reboot_required"), bool):
            fail(f"document {name}: 'reboot_required' must be a boolean")
        for section in body["sections"]:
            if section not in sections:
                fail(f"document {name}: '{section}' is not a serialized root section")
            if section in claimed:
                fail(
                    f"section '{section}' is claimed by both "
                    f"'{claimed[section]}' and '{name}'"
                )
            claimed[section] = name
    orphans = [section for section in sections if section not in claimed]
    if orphans:
        fail(f"no document carries root section(s): {', '.join(orphans)}")
