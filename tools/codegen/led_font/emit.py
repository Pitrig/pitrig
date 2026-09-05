from __future__ import annotations

from typing import Any

from . import BANNER
from .faces import FACES, glyph_count, rows_of


def _table(rows: list[int], stride: int, indent: str, radix: str) -> str:
    lines = []
    for start in range(0, len(rows), stride):
        body = ", ".join(radix % value for value in rows[start : start + stride])
        lines.append(f"{indent}{body},")
    return "\n".join(lines)


def cpp(document: dict[str, Any]) -> str:
    parts = [
        f"// {BANNER}",
        "#pragma once",
        "",
        "#include <array>",
        "#include <cstdint>",
        "",
        "namespace pitrig::led {",
        "",
        f"inline constexpr char kFirstGlyph = '{document['first']}';",
        f"inline constexpr char kLastGlyph = '{document['last']}';",
        f"inline constexpr std::size_t kGlyphCount = {glyph_count(document)};",
        "",
    ]
    for name in FACES:
        face = document["faces"][name]
        rows = rows_of(document, name)
        title = name.capitalize()
        parts += [
            f"inline constexpr std::uint8_t k{title}Width = {face['width']};",
            f"inline constexpr std::uint8_t k{title}Height = {face['height']};",
            f"inline constexpr std::array<std::uint16_t, {len(rows)}> k{title}Glyphs{{{{",
            _table(rows, face["height"], "    ", "0x%04X"),
            "}};",
            "",
        ]
    parts += [
        "struct FaceData {",
        "  std::uint8_t width;",
        "  std::uint8_t height;",
        "  const std::uint16_t* rows;",
        "};",
        "",
        f"inline constexpr std::array<FaceData, {len(FACES)}> kFaces{{{{",
    ]
    for name in FACES:
        face = document["faces"][name]
        title = name.capitalize()
        parts.append(
            f"    {{{face['width']}, {face['height']}, k{title}Glyphs.data()}},"
        )
    parts += ["}};", "", "}"]
    return "\n".join(parts) + "\n"


def typescript(document: dict[str, Any]) -> str:
    parts = [
        f"// {BANNER}",
        "",
        "export type LedFontName = " + " | ".join(f"'{name}'" for name in FACES),
        "",
        f"export const LED_FIRST_GLYPH = {document['first']!r}".replace("'", "'"),
        f"export const LED_LAST_GLYPH = '{document['last']}'",
        "",
        "export interface LedFace {",
        "  readonly width: number",
        "  readonly height: number",
        "  readonly rows: readonly number[]",
        "}",
        "",
        "export const LED_FACES: Record<LedFontName, LedFace> = {",
    ]
    for name in FACES:
        face = document["faces"][name]
        rows = rows_of(document, name)
        parts += [
            f"  {name}: {{",
            f"    width: {face['width']},",
            f"    height: {face['height']},",
            "    rows: [",
            _table(rows, face["height"], "      ", "0x%04X"),
            "    ]",
            "  },",
        ]
    parts += [
        "}",
        "",
        "export function glyphRow(font: LedFontName, character: string, row: number): number {",
        "  const face = LED_FACES[font]",
        "  const code = character.toUpperCase().charCodeAt(0)",
        "  const first = LED_FIRST_GLYPH.charCodeAt(0)",
        "  const last = LED_LAST_GLYPH.charCodeAt(0)",
        "  if (Number.isNaN(code) || code < first || code > last || row >= face.height) return 0",
        "  return face.rows[(code - first) * face.height + row] ?? 0",
        "}",
        "",
        "export function textWidth(font: LedFontName, characters: number): number {",
        "  return characters === 0 ? 0 : characters * (LED_FACES[font].width + 1) - 1",
        "}",
    ]
    return "\n".join(parts) + "\n"
