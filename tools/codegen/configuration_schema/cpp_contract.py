from __future__ import annotations

from typing import Any

from . import BANNER
from .cpp_documents import cpp_default, cpp_field_type, generate_cpp_documents
from .model import snake, struct_order, widget_pools


def generate_cpp_contract(document: dict[str, Any]) -> str:
    lines = [
        f"// {BANNER}",
        "#pragma once",
        "",
        "#include <array>",
        "#include <cstddef>",
        "#include <cstdint>",
        "#include <span>",
        "#include <string_view>",
        "",
    ]
    headers = sorted(
        {body["cpp_header"] for body in document.get("external_types", {}).values()}
    )
    lines.extend(f'#include "{header}"' for header in headers)
    lines.extend(["", "namespace simcore::configuration {", ""])

    lines.append(
        f"inline constexpr std::uint16_t kConfigurationSchemaVersion = "
        f"{document['schema_version']};"
    )
    lines.append("")
    for name, body in document.get("constants", {}).items():
        lines.append(
            f"inline constexpr {body.get('cpp_type', 'std::uint32_t')} {name} = {body['value']}U;"
        )
    lines.append("")
    for name, body in document["limits"].items():
        lines.append(f"inline constexpr std::size_t {name} = {body['value']};")
    lines.append("")

    lines.extend(generate_cpp_documents(document))

    for name, body in document["enums"].items():
        lines.append(f"enum class {name} : std::uint8_t {{")
        lines.extend(f"  {value}," for value in body["json_values"])
        lines.append("};")
        lines.append("")

    for name in struct_order(document):
        body = document["structs"][name]
        lines.append(f"struct {name} {{")
        for field in body.get("fields", []):
            field_type = cpp_field_type(field, document)
            lines.append(
                f"  {field_type} {field['name']}{cpp_default(field, document)};"
            )
        lines.append("};")
        lines.append("")

    for name, body in document["enums"].items():
        values = body["json_values"]
        lines.append(
            f"inline constexpr std::array<std::string_view, {len(values)}> "
            f"k{name}Names{{{{"
        )
        lines.extend(f'    "{value}",' for value in values)
        lines.append("}};")
        lines.append("")
        lines.append(
            f"[[nodiscard]] inline std::string_view {snake(name)}_name(const {name} value) {{"
        )
        lines.append(
            f"  const auto index = static_cast<std::size_t>(value);"
        )
        lines.append(
            f"  return index < k{name}Names.size() ? k{name}Names[index] : std::string_view{{}};"
        )
        lines.append("}")
        lines.append("")
        lines.append(
            f"[[nodiscard]] inline bool {snake(name)}_from_name(const std::string_view name,"
        )
        lines.append(
            f"                                                  {name}& value) {{"
        )
        lines.append(f"  for (std::size_t index = 0; index < k{name}Names.size(); ++index) {{")
        lines.append(f"    if (k{name}Names[index] == name) {{")
        lines.append(f"      value = static_cast<{name}>(index);")
        lines.append("      return true;")
        lines.append("    }")
        lines.append("  }")
        lines.append("  return false;")
        lines.append("}")
        lines.append("")
    lines.extend(generate_cpp_widget_traits(document))
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def generate_cpp_widget_traits(document: dict[str, Any]) -> list[str]:
    pools = widget_pools(document)
    lines = [
        "struct WidgetTypeTraits {",
        "  WidgetType type{};",
        "  std::string_view name{};",
        "  std::string_view storage_key{};",
        "  std::size_t capacity{};",
        "  std::uint8_t (*count)(const DashboardConfiguration&){};",
        "  void (*set_count)(DashboardConfiguration&, std::uint8_t){};",
        "  const WidgetFrame* (*frame)(const DashboardConfiguration&,",
        "                              std::uint8_t){};",
        "  WidgetFrame* (*mutable_frame)(DashboardConfiguration&, std::uint8_t){};",
        "  std::span<const std::byte> (*element_bytes)(const DashboardConfiguration&,",
        "                                              std::uint8_t){};",
        "};",
        "",
        f"inline constexpr std::array<WidgetTypeTraits, {len(pools)}> "
        "kWidgetTypeTraits{{",
    ]
    for value, struct, field in pools:
        pool = field["name"]
        count = field["count_field"]
        lines.extend(
            [
                "    {",
                f"        .type = WidgetType::{value},",
                f'        .name = "{value}",',
                f'        .storage_key = "{pool}",',
                f"        .capacity = {field['capacity']},",
                "        .count = [](const DashboardConfiguration& dashboard)",
                "            -> std::uint8_t { return dashboard." + count + "; },",
                "        .set_count = [](DashboardConfiguration& dashboard,",
                "                        const std::uint8_t value) {",
                f"          dashboard.{count} = value;",
                "        },",
                "        .frame = [](const DashboardConfiguration& dashboard,",
                "                    const std::uint8_t index) -> const WidgetFrame* {",
                f"          return index < dashboard.{count}",
                f"                     ? &dashboard.{pool}[index].frame",
                "                     : nullptr;",
                "        },",
                "        .mutable_frame = [](DashboardConfiguration& dashboard,",
                "                            const std::uint8_t index) -> WidgetFrame* {",
                f"          return index < dashboard.{count}",
                f"                     ? &dashboard.{pool}[index].frame",
                "                     : nullptr;",
                "        },",
                "        .element_bytes =",
                "            [](const DashboardConfiguration& dashboard,",
                "               const std::uint8_t index) -> std::span<const std::byte> {",
                f"          if (index >= dashboard.{count}) {{",
                "            return {};",
                "          }",
                f"          return std::as_bytes(std::span{{&dashboard.{pool}[index], 1}});",
                "        },",
                "    },",
            ]
        )
    lines.extend(
        [
            "}};",
            "",
            "[[nodiscard]] inline const WidgetTypeTraits& widget_traits(",
            "    const WidgetType type) {",
            "  const auto index = static_cast<std::size_t>(type);",
            "  return index < kWidgetTypeTraits.size() ? kWidgetTypeTraits[index]",
            "                                         : kWidgetTypeTraits[0];",
            "}",
            "",
        ]
    )
    return lines
