from __future__ import annotations

from typing import Any

from .model import bound, json_key, serialized_fields
from .scalars import SCALAR_DOC, SCALAR_RANGES


def generate_markdown(document: dict[str, Any]) -> str:
    version = document["schema_version"]
    lines = [
        "# Configuration schema reference",
        "",
        f"This file is generated from `configuration/configuration_schema.json`. "
        f"It is the mechanical property reference for configuration schema {version}. "
        "Narrative rules and presence semantics live in "
        "[device-configuration.md](device-configuration.md); the control protocol in "
        "[control-protocol.md](control-protocol.md).",
        "",
        f"Schema version: {version}.",
        "",
        "## Documents",
        "",
        "The configuration is transferred and stored as three independent documents. "
        "Each carries the `board` identifier — so each is validated against the board "
        "it arrives at — plus the root sections listed here, and is rejected if it "
        "carries any other. `@PR:GET`, `@PR:SET`, `@PR:VALIDATE` and `@PR:APPLY` name "
        "one of them.",
        "",
        "| Document | Carries | Maximum payload | Restart to take effect | Purpose |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, body in document["documents"].items():
        sections = ", ".join(f"`{section}`" for section in body["sections"])
        restart = "yes" if body["reboot_required"] else "no"
        lines.append(
            f"| `{name}` | `board`, {sections} | {body['max_payload']} bytes | "
            f"{restart} | {body.get('doc', '')} |"
        )
    lines.append("")

    lines.extend([
        "## Limits",
        "",
        "| Constant | Value | Meaning |",
        "| --- | --- | --- |",
    ])
    for name, body in document["limits"].items():
        lines.append(f"| `{name}` | {body['value']} | {body.get('doc', '')} |")
    lines.append("")

    lines.extend(["## Enumerations", "", "| Type | Accepted values | Meaning |", "| --- | --- | --- |"])
    for name, body in document["enums"].items():
        values = ", ".join(f"`{value}`" for value in body["json_values"])
        lines.append(f"| `{name}` | {values} | {body.get('doc', '')} |")
    lines.append("")

    lines.extend(["## Objects", ""])
    for name in document["structs"]:
        body = document["structs"][name]
        if body.get("serialized") is False:
            continue
        if body.get("json_kind") == "empty_array":
            lines.append(f"### {name}")
            lines.append("")
            if body.get("doc"):
                lines.append(body["doc"])
                lines.append("")
            lines.append("Accepted as an empty array only.")
            lines.append("")
            continue
        fields = [field for field in serialized_fields(body) if not field.get("flatten")]
        if not fields:
            continue
        flattened = [
            field["struct"]
            for field in serialized_fields(body)
            if field.get("flatten") and field["kind"] == "struct"
        ]
        lines.append(f"### {name}")
        lines.append("")
        if body.get("doc"):
            lines.append(body["doc"])
            lines.append("")
        if flattened:
            links = [f"[`{struct}`](#{struct.lower()})" for struct in flattened]
            references = (
                links[0] if len(links) == 1 else f"{', '.join(links[:-1])} and {links[-1]}"
            )
            lines.append(
                f"Also carries the properties of {references}, flattened: they are "
                "plain properties of this object in JSON."
            )
            lines.append("")
        lines.append("| Property | Type | Default |")
        lines.append("| --- | --- | --- |")
        if body.get("widget_type"):
            lines.append(
                f"| `type` | `WidgetType`, fixed `{body['widget_type']}` | required |"
            )
        for field in fields:
            if field["kind"] == "external" and field.get("inline"):
                external = document["external_types"][field["external"]]
                for key in external["keys"]:
                    lines.append(
                        f"| `{key}` | see `{field['external']}` | absent |"
                    )
                continue
            lines.append(
                f"| `{json_key(field)}` | {markdown_type(field, document)} | "
                f"{markdown_default(field, document)} |"
            )
        lines.append("")

    lines.extend(["## Validation errors", "", "| Token | Meaning |", "| --- | --- |"])
    for entry in document["validation_errors"]:
        lines.append(f"| `{entry['name']}` | {entry.get('doc', '')} |")
    lines.append("")
    return "\n".join(lines)


def markdown_type(field: dict[str, Any], document: dict[str, Any]) -> str:
    kind = field["kind"]
    if kind == "enum":
        return f"`{field['enum']}`"
    if kind == "struct":
        return f"[`{field['struct']}`](#{field['struct'].lower()})"
    if kind == "array":
        capacity = document["limits"][field["capacity"]]["value"]
        variants = field.get("json_variants")
        if variants:
            rendered = ", ".join(
                f"[`{struct}`](#{struct.lower()})" for struct in variants.values()
            )
            return f"array of {rendered}, max {capacity}, discriminated by `type`"
        return f"array of [`{field['struct']}`](#{field['struct'].lower()}), max {capacity}"
    if kind == "external":
        return f"`{field['external']}`"
    if kind == "text":
        capacity = document["limits"][field["capacity"]]["value"]
        return f"string, max {capacity - 1} bytes"
    if kind in SCALAR_RANGES:
        low, high = SCALAR_RANGES[kind]
        minimum = bound(field, "minimum", document)
        maximum = bound(field, "maximum", document)
        if minimum is None and maximum is None:
            return SCALAR_DOC.get(kind, kind)
        low = minimum[1] if minimum else low
        high = maximum[1] if maximum else high
        window = f"{low}..{high}"
        if field.get("zero_means_off"):
            window = f"0 or {window}"
        return f"integer, {window}"
    return SCALAR_DOC.get(kind, kind)


def markdown_default(field: dict[str, Any], document: dict[str, Any]) -> str:
    kind = field["kind"]
    if kind == "enum":
        default = field.get("default", document["enums"][field["enum"]]["default"])
        return f"`{default}`"
    if kind in ("color", "optional_color"):
        default = field.get("default")
        if default is None:
            return "absent"
        if str(default).startswith("k"):
            return f"`{default}` (no background)"
        return f"`#{int(str(default), 16):06X}`"
    if kind == "text":
        default = field.get("default", "")
        return f"`{default}`" if default else "empty"
    if kind == "bool":
        return "`true`" if field.get("default") else "`false`"
    if kind in ("struct", "array", "external"):
        return "absent"
    return f"`{field.get('default', 0)}`"
