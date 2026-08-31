from __future__ import annotations

from typing import Any

from .model import document_fields, document_ids, document_keys, document_type, json_key, serialized_fields
from .scalars import SCALAR_TS


def ts_field_type(field: dict[str, Any], document: dict[str, Any]) -> str:
    kind = field["kind"]
    if kind == "enum":
        return field["enum"]
    if kind == "struct":
        return field["struct"]
    if kind == "array":
        if field.get("json_variants"):
            return "WidgetConfiguration[]"
        return f"{field['struct']}[]"
    if kind == "external":
        return document["external_types"][field["external"]]["typescript"]
    return SCALAR_TS[kind]


def generate_typescript_documents(document: dict[str, Any]) -> list[str]:
    ids = document_ids(document)
    lines = [
        "export type ConfigurationDocumentId = "
        + " | ".join(f"'{name}'" for name in ids),
        "export const CONFIGURATION_DOCUMENT_IDS: readonly ConfigurationDocumentId[] = ["
        + ", ".join(f"'{name}'" for name in ids)
        + "]",
        "",
    ]
    for name in ids:
        body = document["documents"][name]
        lines.append(f"export interface {document_type(name)} {{")
        for field in document_fields(document, name):
            if field.get("flatten"):
                for inner in serialized_fields(document["structs"][field["struct"]]):
                    optional = "" if inner.get("required") else "?"
                    lines.append(
                        f"  {json_key(inner)}{optional}: "
                        f"{ts_field_type(inner, document)}"
                    )
                continue
            lines.append(
                f"  {json_key(field)}?: {ts_field_type(field, document)}"
            )
        lines.append("}")
        lines.append("")
    lines.append(
        "export type ConfigurationDocument = "
        + " | ".join(document_type(name) for name in ids)
    )
    lines.append("")
    lines.extend(
        [
            "export interface ConfigurationDocumentDescriptor {",
            "  readonly id: ConfigurationDocumentId",
            "  readonly sections: readonly string[]",
            "  readonly keys: readonly string[]",
            "  readonly maxPayload: number",
            "  readonly rebootRequired: boolean",
            "}",
            "",
            "export const CONFIGURATION_DOCUMENTS: Record<",
            "  ConfigurationDocumentId,",
            "  ConfigurationDocumentDescriptor",
            "> = {",
        ]
    )
    for name in ids:
        body = document["documents"][name]
        sections = ", ".join(f"'{section}'" for section in body["sections"])
        keys = ", ".join(f"'{key}'" for key in document_keys(document, name))
        lines.append(
            f"  {name}: {{ id: '{name}', sections: [{sections}], keys: [{keys}], "
            f"maxPayload: {body['max_payload']}, "
            f"rebootRequired: {str(body['reboot_required']).lower()} }},"
        )
    lines.append("}")
    lines.append("")
    return lines
