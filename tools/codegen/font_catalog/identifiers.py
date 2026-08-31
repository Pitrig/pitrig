from __future__ import annotations

import hashlib
import re
from typing import Any

from .errors import fail


IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9_-]{1,31}$")


WEIGHT_SUFFIXES = {
    "100": "_thin",
    "200": "_extralight",
    "300": "_light",
    "400": "",
    "500": "_medium",
    "600": "_semibold",
    "700": "_bold",
    "800": "_extrabold",
    "900": "_black",
}


def font_family_id(family: str, variant: str) -> str:
    italic = variant.endswith("italic")
    weight = variant[: -len("italic")] if italic else variant
    suffix = WEIGHT_SUFFIXES.get(weight, f"_w{weight}")
    if italic:
        suffix = f"{suffix}_italic"
    base = re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", family.lower()))
    budget = 31 - len(suffix)
    if len(base) <= budget:
        return base + suffix
    trimmed = re.sub(r"^-+|-+$", "", base[: budget - 7])
    return f"{trimmed}_{hash6(f'{family}|{variant}')}{suffix}"


def hash6(value: str) -> str:
    digest = 0x811C9DC5
    for character in value:
        digest ^= ord(character)
        digest = (digest * 0x01000193) & 0xFFFFFFFF
    return base36(digest).rjust(6, "0")[-6:]


def base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    digits = []
    while value:
        value, remainder = divmod(value, 36)
        digits.append(alphabet[remainder])
    return "".join(reversed(digits))


def check_identifiers(families: list[dict[str, Any]]) -> None:
    seen: dict[str, tuple[str, str]] = {}
    for family in families:
        for variant in family["variants"]:
            identifier = font_family_id(family["name"], variant["variant"])
            if not IDENTIFIER_PATTERN.match(identifier):
                fail(f"{family['name']} {variant['variant']} derives an invalid id: {identifier}")
            collision = seen.get(identifier)
            if collision:
                fail(
                    f"{family['name']} {variant['variant']} and {collision[0]} "
                    f"{collision[1]} both derive {identifier}"
                )
            seen[identifier] = (family["name"], variant["variant"])
