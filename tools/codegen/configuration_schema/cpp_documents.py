from __future__ import annotations

from typing import Any

from .model import document_ids
from .scalars import SCALAR_CPP


def cpp_text_default(value: str, capacity_name: str) -> str:
    if not value:
        return "{}"
    characters = ", ".join(f"'{character}'" for character in value)
    return "{" + characters + ", '\\0'}"


def cpp_default(field: dict[str, Any], document: dict[str, Any]) -> str:
    kind = field["kind"]
    if kind == "text":
        return cpp_text_default(field.get("default", ""), field["capacity"])
    if kind == "enum":
        enum_name = field["enum"]
        default = field.get("default", document["enums"][enum_name]["default"])
        return f"{{{enum_name}::{default}}}"
    if kind in ("color", "optional_color"):
        default = field.get("default")
        return "{}" if default is None else f"{{{default}}}"
    if kind == "bool":
        return "{true}" if field.get("default") else "{false}"
    if kind == "float":
        default = field.get("default", 0)
        return "{}" if not default else f"{{{float(default)}F}}"
    if kind in SCALAR_CPP:
        default = field.get("default", 0)
        return "{}" if default in (0, None) else f"{{{default}}}"
    return "{}"


def cpp_field_type(field: dict[str, Any], document: dict[str, Any]) -> str:
    kind = field["kind"]
    if kind == "text":
        return f"std::array<char, {field['capacity']}>"
    if kind == "enum":
        return field["enum"]
    if kind == "struct":
        return field["struct"]
    if kind == "array":
        return f"std::array<{field['struct']}, {field['capacity']}>"
    if kind == "external":
        return document["external_types"][field["external"]]["cpp"]
    return SCALAR_CPP[kind]


def generate_cpp_documents(document: dict[str, Any]) -> list[str]:
    ids = document_ids(document)
    lines = [
        "enum class ConfigurationDocument : std::uint8_t {",
    ]
    lines.extend(f"  {name}," for name in ids)
    lines.append("};")
    lines.append("")
    lines.append(
        f"inline constexpr std::size_t kConfigurationDocumentCount = {len(ids)};"
    )
    lines.append("")
    lines.append(
        f"inline constexpr std::array<std::string_view, {len(ids)}> "
        "kConfigurationDocumentNames{{"
    )
    lines.extend(f'    "{name}",' for name in ids)
    lines.append("}};")
    lines.append("")
    lines.extend(
        [
            "[[nodiscard]] inline std::string_view configuration_document_name(",
            "    const ConfigurationDocument value) {",
            "  const auto index = static_cast<std::size_t>(value);",
            "  return index < kConfigurationDocumentNames.size()",
            "             ? kConfigurationDocumentNames[index]",
            "             : std::string_view{};",
            "}",
            "",
            "[[nodiscard]] inline bool configuration_document_from_name(",
            "    const std::string_view name, ConfigurationDocument& value) {",
            "  for (std::size_t index = 0; index < kConfigurationDocumentNames.size();",
            "       ++index) {",
            "    if (kConfigurationDocumentNames[index] == name) {",
            "      value = static_cast<ConfigurationDocument>(index);",
            "      return true;",
            "    }",
            "  }",
            "  return false;",
            "}",
            "",
        ]
    )
    sizes = [document["documents"][name]["max_payload"] for name in ids]
    lines.append(
        f"inline constexpr std::array<std::size_t, {len(ids)}> "
        "kConfigurationDocumentPayloadSizes{{"
    )
    lines.extend(f"    {size}," for size in sizes)
    lines.append("}};")
    lines.append("")
    lines.extend(
        [
            "[[nodiscard]] inline std::size_t configuration_document_payload_size(",
            "    const ConfigurationDocument value) {",
            "  const auto index = static_cast<std::size_t>(value);",
            "  return index < kConfigurationDocumentPayloadSizes.size()",
            "             ? kConfigurationDocumentPayloadSizes[index]",
            "             : std::size_t{0};",
            "}",
            "",
        ]
    )
    flags = [
        "true" if document["documents"][name]["reboot_required"] else "false"
        for name in ids
    ]
    lines.append(
        f"inline constexpr std::array<bool, {len(ids)}> "
        "kConfigurationDocumentRebootRequired{{"
    )
    lines.extend(f"    {flag}," for flag in flags)
    lines.append("}};")
    lines.append("")
    lines.extend(
        [
            "[[nodiscard]] inline bool configuration_document_reboot_required(",
            "    const ConfigurationDocument value) {",
            "  const auto index = static_cast<std::size_t>(value);",
            "  return index < kConfigurationDocumentRebootRequired.size() &&",
            "         kConfigurationDocumentRebootRequired[index];",
            "}",
            "",
        ]
    )
    return lines
