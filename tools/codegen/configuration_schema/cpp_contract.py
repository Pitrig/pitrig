from __future__ import annotations

from typing import Any

from . import BANNER
from .cpp_documents import cpp_default, cpp_field_type, generate_cpp_documents
from .model import device_view, root_struct, snake, struct_order, widget_pools


def generate_cpp_contract(document: dict[str, Any]) -> str:
    document = device_view(document)
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
    lines.extend(["", "namespace pitrig::configuration {", ""])

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
    lines.extend(generate_cpp_color_visitors(document))
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


COLOR_KINDS = ("color", "optional_color")


def dashboard_sections(document: dict[str, Any]) -> list[dict[str, Any]]:
    sections = set(document["documents"]["dashboard"]["sections"])
    return [
        field
        for field in document["structs"][root_struct(document)]["fields"]
        if field["name"] in sections
    ]


def dashboard_structs(document: dict[str, Any]) -> set[str]:
    structs = document["structs"]
    pending = [
        field["struct"]
        for field in dashboard_sections(document)
        if field["kind"] in ("struct", "array")
    ]
    reached: set[str] = set()
    while pending:
        name = pending.pop()
        if name in reached:
            continue
        reached.add(name)
        pending.extend(
            field["struct"]
            for field in structs[name].get("fields", [])
            if field["kind"] in ("struct", "array")
        )
    return reached


def generate_cpp_color_visitors(document: dict[str, Any]) -> list[str]:
    structs = document["structs"]
    reached = dashboard_structs(document)
    holds: dict[str, bool] = {}

    def holds_colors(name: str) -> bool:
        if name not in holds:
            holds[name] = any(
                field["kind"] in COLOR_KINDS
                or (field["kind"] in ("struct", "array") and holds_colors(field["struct"]))
                for field in structs[name].get("fields", [])
            )
        return holds[name]

    def visit_field(field: dict[str, Any]) -> list[str]:
        member = field["name"]
        if field["kind"] in COLOR_KINDS:
            return [f"  visit(value.{member});"]
        if field["kind"] == "struct" and holds_colors(field["struct"]):
            return [f"  for_each_color(value.{member}, visit);"]
        if field["kind"] == "array" and holds_colors(field["struct"]):
            count = field["count_field"]
            return [
                f"  for (std::size_t index = 0;",
                f"       index < value.{count} && index < value.{member}.size();",
                "       ++index) {",
                f"    for_each_color(value.{member}[index], visit);",
                "  }",
            ]
        return []

    lines: list[str] = []
    for name in struct_order(document):
        if name not in reached or not holds_colors(name):
            continue
        lines.append("template <typename Visit>")
        lines.append(f"void for_each_color({name}& value, Visit& visit) {{")
        for field in structs[name].get("fields", []):
            lines.extend(visit_field(field))
        lines.append("}")
        lines.append("")
    lines.append("template <typename Visit>")
    lines.append(f"void for_each_dashboard_color({root_struct(document)}& value, Visit& visit) {{")
    for field in dashboard_sections(document):
        lines.extend(visit_field(field))
    lines.append("}")
    lines.append("")
    return lines


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
