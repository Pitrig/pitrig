from __future__ import annotations

from typing import Any

from . import BANNER
from .model import (
    bounded_fields,
    document_ids,
    document_keys,
    document_type,
    object_keys,
    struct_order,
)


def generate_cpp_document_keys(document: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    ids = document_ids(document)
    for name in ids:
        keys = document_keys(document, name)
        lines.append(
            f"inline constexpr std::array<std::string_view, {len(keys)}> "
            f"k{document_type(name)}Keys{{{{"
        )
        lines.extend(f'    "{key}",' for key in keys)
        lines.append("}};")
        lines.append("")
    lines.extend(
        [
            "[[nodiscard]] inline std::span<const std::string_view> document_keys(",
            "    const ConfigurationDocument value) {",
            "  switch (value) {",
        ]
    )
    for name in ids:
        lines.append(f"    case ConfigurationDocument::{name}:")
        lines.append(f"      return k{document_type(name)}Keys;")
    lines.extend(
        [
            "  }",
            "  return {};",
            "}",
            "",
        ]
    )
    return lines


def generate_cpp_parser(document: dict[str, Any]) -> str:
    errors = document["validation_errors"]
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
        '#include "application_configuration_generated.hpp"',
        "",
        "namespace simcore::configuration {",
        "",
        "enum class ValidationError : std::uint8_t {",
    ]
    lines.extend(f"  {entry['name']}," for entry in errors)
    lines.append("};")
    lines.append("")
    lines.append(
        f"inline constexpr std::array<std::string_view, {len(errors)}> "
        "kValidationErrorNames{{"
    )
    lines.extend(f'    "{entry["name"]}",' for entry in errors)
    lines.append("}};")
    lines.append("")
    lines.append(
        "[[nodiscard]] inline std::string_view validation_error_name("
        "const ValidationError error) {"
    )
    lines.append("  const auto index = static_cast<std::size_t>(error);")
    lines.append(
        "  return index < kValidationErrorNames.size() ? kValidationErrorNames[index]"
    )
    lines.append("                                             : std::string_view{};")
    lines.append("}")
    lines.append("")
    lines.extend(
        [
            "struct ValidationFailure {",
            "  ValidationError error{ValidationError::none};",
            "  std::int16_t screen_index{-1};",
            "  std::int16_t widget_index{-1};",
            "  std::array<char, kValidationPathCapacity> path{};",
            "",
            "  [[nodiscard]] constexpr bool ok() const {",
            "    return error == ValidationError::none;",
            "  }",
            "};",
            "",
            "namespace schema {",
            "",
        ]
    )
    key_sets = {
        name: body["keys"]
        for name, body in document.get("external_types", {}).items()
        if body.get("keys")
    }
    key_sets.update(
        {name: object_keys(document, name) for name in document["structs"]}
    )
    for name, keys in key_sets.items():
        if not keys:
            continue
        lines.append(
            f"inline constexpr std::array<std::string_view, {len(keys)}> k{name}Keys{{{{"
        )
        lines.extend(f'    "{key}",' for key in keys)
        lines.append("}};")
        lines.append("")
    lines.extend(generate_cpp_document_keys(document))
    for name in struct_order(document):
        entries = bounded_fields(document, name, expand_flatten=False)
        if not entries:
            continue
        lines.append(
            "[[nodiscard]] inline std::string_view range_error("
            f"const {name}& config) {{"
        )
        for entry in entries:
            member = f"config.{entry['accessor']}"
            tests = []
            if entry["minimum"] is not None:
                tests.append(f"{member} < {entry['minimum'][0]}")
            if entry["maximum"] is not None:
                tests.append(f"{member} > {entry['maximum'][0]}")
            test = " || ".join(tests)
            if entry["zero_means_off"]:
                lines.append(f"  if ({member} != 0 &&")
                lines.append(f"      ({test})) {{")
            else:
                lines.append(f"  if ({test}) {{")
            lines.append(f'    return "{entry["path"]}";')
            lines.append("  }")
        lines.append("  return {};")
        lines.append("}")
        lines.append("")
    lines.append("}")
    lines.append("")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)
