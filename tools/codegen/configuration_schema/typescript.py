from __future__ import annotations

from typing import Any

from . import BANNER
from .model import (
    bounded_fields,
    child_types,
    json_key,
    object_keys,
    range_roots,
    screaming,
    serialized_fields,
    struct_order,
    text_fields,
    widget_variants,
)
from .scalars import SCALAR_RANGES
from .typescript_documents import generate_typescript_documents, ts_field_type


def generate_typescript(document: dict[str, Any]) -> str:
    lines = [
        f"// {BANNER}",
        "",
        "export type RgbColor = `#${string}`",
        "",
        f"export const CONFIGURATION_SCHEMA_VERSION = {document['schema_version']}",
        "",
    ]
    for name, body in document["limits"].items():
        lines.append(f"export const {screaming(name)} = {body['value']}")
    lines.append("")

    for name, body in document["enums"].items():
        union = " | ".join(f"'{value}'" for value in body["json_values"])
        lines.append(f"export type {name} = {union}")
        lines.append(
            f"export const {screaming(name)}_VALUES: readonly {name}[] = "
            f"[{', '.join(chr(39) + value + chr(39) for value in body['json_values'])}]"
        )
        lines.append("")

    lines.extend(
        [
            "export interface FieldRange {",
            "  readonly key: string",
            "  readonly minimum: number",
            "  readonly maximum: number",
            "  readonly zeroMeansOff?: boolean",
            "}",
            "",
            "export const FIELD_RANGES: Record<string, readonly FieldRange[]> = {",
        ]
    )
    for name in range_roots(document):
        body = document["structs"][name]
        key = body.get("widget_type") or name
        rendered = []
        for entry in bounded_fields(document, name, expand_flatten=True):
            low, high = SCALAR_RANGES[entry["kind"]]
            if entry["minimum"] is not None:
                low = entry["minimum"][1]
            if entry["maximum"] is not None:
                high = entry["maximum"][1]
            parts = [f"key: '{entry['path']}'", f"minimum: {low}", f"maximum: {high}"]
            if entry["zero_means_off"]:
                parts.append("zeroMeansOff: true")
            rendered.append("{ " + ", ".join(parts) + " }")
        lines.append(f"  {key}: [{', '.join(rendered)}],")
    lines.append("}")
    lines.append("")

    error_names = [entry["name"] for entry in document["validation_errors"]]
    lines.append(
        "export type ValidationErrorToken = "
        + " | ".join(f"'{name}'" for name in error_names)
    )
    lines.append(
        "export const VALIDATION_ERROR_TOKENS: readonly ValidationErrorToken[] = "
        f"[{', '.join(chr(39) + name + chr(39) for name in error_names)}]"
    )
    lines.append("")

    externals = document.get("external_types", {})
    if "FontSpec" in externals:
        lines.extend(
            [
                "export interface FontSpec {",
                "  family?: string",
                "  size_px?: number",
                "  fallback?: string",
                "}",
                "",
            ]
        )
    if "TimeTransformConfig" in externals:
        lines.extend(
            [
                "export interface TimeTransform {",
                "  format?: 'duration_ms' | 'signed_duration_ms' | 'clock_ms'",
                "}",
                "",
            ]
        )
    if "NumberTransformConfig" in externals:
        lines.extend(
            [
                "export interface NumberTransform {",
                "  decimals?: number",
                "  scale?: number",
                "  offset?: number",
                "}",
                "",
            ]
        )

    for name in struct_order(document):
        body = document["structs"][name]
        if body.get("serialized") is False:
            continue
        if body.get("json_kind") == "empty_array":
            lines.append(f"export type {name} = readonly never[]")
            lines.append("")
            continue
        fields = serialized_fields(body)
        if not fields:
            continue
        inherited = [
            document["external_types"][field["external"]]["typescript"]
            for field in fields
            if field["kind"] == "external" and field.get("inline")
        ]
        extends = f" extends {', '.join(inherited)}" if inherited else ""
        lines.append(f"export interface {name}{extends} {{")
        if body.get("widget_type"):
            lines.append(f"  type: '{body['widget_type']}'")
        for field in fields:
            if field["kind"] == "external" and field.get("inline"):
                continue
            if field.get("flatten"):
                for inner in serialized_fields(document["structs"][field["struct"]]):
                    inner_optional = "" if inner.get("required") else "?"
                    lines.append(
                        f"  {json_key(inner)}{inner_optional}: "
                        f"{ts_field_type(inner, document)}"
                    )
                continue
            optional = "" if field.get("required") else "?"
            lines.append(
                f"  {json_key(field)}{optional}: {ts_field_type(field, document)}"
            )
        lines.append("}")
        lines.append("")

    lines.extend(generate_typescript_documents(document))

    variants = widget_variants(document)
    if variants:
        union = " | ".join(sorted(variants.values()))
        lines.append(f"export type WidgetConfiguration = {union}")
        lines.append("")
        rendered = ", ".join(f"'{value}'" for value in variants)
        lines.append(f"export const WIDGET_TYPES: readonly string[] = [{rendered}]")
        lines.append("")

    lines.extend(
        [
            "export const SCHEMA_OBJECT_KEYS: Record<string, readonly string[]> = {",
        ]
    )
    for name in document["structs"]:
        keys = object_keys(document, name)
        if not keys:
            continue
        rendered = ", ".join(f"'{key}'" for key in keys)
        lines.append(f"  {name}: [{rendered}],")
    lines.append("}")
    lines.append("")

    variants = widget_variants(document)
    rendered_variants = ", ".join(
        f"{key}: '{struct}'" for key, struct in variants.items()
    )
    lines.extend(
        [
            "export const SCHEMA_WIDGET_STRUCTS: Record<string, string> = "
            f"{{ {rendered_variants} }}",
            "",
            "export const SCHEMA_VARIANT_ARRAYS: Record<string, readonly string[]> = {",
        ]
    )
    for name, body in document["structs"].items():
        arrays = [
            json_key(field)
            for field in body["fields"]
            if field["kind"] == "array" and field.get("json_variants")
        ]
        if not arrays:
            continue
        rendered = ", ".join(f"'{key}'" for key in arrays)
        lines.append(f"  {name}: [{rendered}],")
    lines.extend(
        [
            "}",
            "",
            "export const SCHEMA_CHILD_TYPES: Record<string, Record<string, string>> = {",
        ]
    )
    for name, body in document["structs"].items():
        if body.get("serialized") is False:
            continue
        children = child_types(document, body)
        if not children:
            continue
        rendered = ", ".join(f"{key}: '{value}'" for key, value in children.items())
        lines.append(f"  {name}: {{ {rendered} }},")
    lines.append("}")
    lines.append("")

    lines.extend(
        [
            "export const TEXT_CAPACITIES: Record<string, number> = {",
        ]
    )
    for struct_name in document["structs"]:
        for owner, field in text_fields(document, document["structs"][struct_name]):
            limit = document["limits"][field["capacity"]]["value"]
            lines.append(f"  '{struct_name}.{json_key(field)}': {limit},")
            del owner
    lines.append("}")
    lines.append("")
    return "\n".join(lines)
