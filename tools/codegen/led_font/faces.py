from __future__ import annotations

import json
from typing import Any

from . import SOURCE
from .errors import fail

FACES = ("regular_4x6", "bold_4x6", "regular_6x8", "bold_6x8")

MAXIMUM_WIDTH = 16


def load_font() -> dict[str, Any]:
    if not SOURCE.exists():
        fail(f"missing source document {SOURCE.name}")
    try:
        document = json.loads(SOURCE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{SOURCE.name} is not valid JSON: {error}")
    for key in ("first", "last", "faces"):
        if key not in document:
            fail(f"missing top-level key '{key}'")
    if len(document["first"]) != 1 or len(document["last"]) != 1:
        fail("'first' and 'last' must each be a single character")
    if ord(document["first"]) > ord(document["last"]):
        fail("'first' must not come after 'last'")
    for name in FACES:
        if name not in document["faces"]:
            fail(f"missing face '{name}'")
    for name, face in document["faces"].items():
        if name not in FACES:
            fail(f"unknown face '{name}'")
        for key in ("width", "height", "glyphs"):
            if key not in face:
                fail(f"face {name}: missing key '{key}'")
        if not 1 <= face["width"] <= MAXIMUM_WIDTH:
            fail(f"face {name}: width must be 1 to {MAXIMUM_WIDTH}, so a row fits two bytes")
        for glyph, rows in face["glyphs"].items():
            if len(glyph) != 1:
                fail(f"face {name}: '{glyph}' is not a single character")
            if not ord(document["first"]) <= ord(glyph) <= ord(document["last"]):
                fail(f"face {name}: '{glyph}' is outside the declared range")
            if len(rows) != face["height"]:
                fail(f"face {name}: '{glyph}' has {len(rows)} rows, not {face['height']}")
            for row in rows:
                if len(row) != face["width"]:
                    fail(f"face {name}: '{glyph}' has a row of {len(row)}, not {face['width']}")
                if set(row) - {"#", " "}:
                    fail(f"face {name}: '{glyph}' uses something other than '#' and ' '")
    return document


def rows_of(document: dict[str, Any], name: str) -> list[int]:
    face = document["faces"][name]
    width = face["width"]
    blank = [" " * width] * face["height"]
    packed: list[int] = []
    for code in range(ord(document["first"]), ord(document["last"]) + 1):
        for row in face["glyphs"].get(chr(code), blank):
            bits = 0
            for column, cell in enumerate(row):
                if cell == "#":
                    bits |= 1 << (width - 1 - column)
            packed.append(bits)
    return packed


def glyph_count(document: dict[str, Any]) -> int:
    return ord(document["last"]) - ord(document["first"]) + 1
