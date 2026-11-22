from __future__ import annotations

import json
import re
from dataclasses import dataclass

from . import SOURCE
from .errors import fail

NAME = re.compile(r"^[a-z][a-z_]*$")
TOKEN = re.compile(r"^@[A-Z]{2}:$")


@dataclass(frozen=True)
class Prefix:
    name: str
    value: str


def load_prefixes() -> list[Prefix]:
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    if document.get("version") != 1:
        fail(f"{SOURCE.name}: version must be 1")
    entries = document.get("prefixes")
    if not isinstance(entries, dict) or not entries:
        fail(f"{SOURCE.name}: prefixes must be a non-empty object")
    prefixes = []
    for name, entry in entries.items():
        if not NAME.match(name):
            fail(f"{SOURCE.name}: prefix name {name!r} must be snake_case")
        value = entry.get("value") if isinstance(entry, dict) else None
        if not isinstance(value, str) or not TOKEN.match(value):
            fail(f"{SOURCE.name}: prefix {name} must be '@', two capitals and ':'")
        prefixes.append(Prefix(name, value))
    values = [prefix.value for prefix in prefixes]
    if len(set(values)) != len(values):
        fail(f"{SOURCE.name}: two prefixes share a value")
    return prefixes


def camel(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))
