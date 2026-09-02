from __future__ import annotations

import json
import re
from typing import Any

from . import BASE_LOCALE, SOURCE
from .errors import fail

PLURAL_FORMS = ("zero", "one", "two", "few", "many", "other")
NOTE_KEY = "$note"
PLURAL_KEY = "$plural"
SEGMENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
PLACEHOLDER = re.compile(r"\{(\w+)\}")


class Message:
    def __init__(self, forms: dict[str | None, str], parameters: tuple[str, ...]) -> None:
        self.forms = forms
        self.parameters = parameters

    @property
    def plural(self) -> bool:
        return None not in self.forms


def locale_path(locale: str):
    return SOURCE / f"{locale}.json"


def load_locale(locale: str) -> dict[str, Any]:
    path = locale_path(locale)
    if not path.exists():
        fail(f"missing source document {path.name}")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path.name} is not valid JSON: {error}")
    if not isinstance(document, dict):
        fail(f"{path.name} must hold an object at the top level")
    return document


def available_locales() -> tuple[str, ...]:
    if not SOURCE.is_dir():
        fail(f"missing source directory {SOURCE}")
    others = sorted(
        path.stem for path in SOURCE.glob("*.json") if path.stem != BASE_LOCALE
    )
    return (BASE_LOCALE, *others)


def parameters_of(texts: list[str]) -> tuple[str, ...]:
    found: list[str] = []
    for text in texts:
        for name in PLACEHOLDER.findall(text):
            if name not in found:
                found.append(name)
    return tuple(sorted(found))


def read_plural(path: str, node: dict[str, Any]) -> Message:
    value = node[PLURAL_KEY]
    if not isinstance(value, dict):
        fail(f"'{path}.{PLURAL_KEY}' must be an object of plural forms")
    unknown = sorted(set(value) - set(PLURAL_FORMS))
    if unknown:
        fail(f"'{path}.{PLURAL_KEY}' holds forms that are not plural categories: " + ", ".join(unknown))
    forms: dict[str | None, str] = {}
    for form in PLURAL_FORMS:
        if form not in value:
            continue
        text = value[form]
        if not isinstance(text, str) or not text.strip():
            fail(f"'{path}.{PLURAL_KEY}.{form}' must be a non-empty string")
        forms[form] = text
    if "other" not in forms:
        fail(f"plural message '{path}' must carry an 'other' form")
    extra = sorted(set(node) - {PLURAL_KEY, NOTE_KEY})
    if extra:
        fail(f"'{path}' holds a plural message and cannot also nest " + ", ".join(extra))
    parameters = parameters_of(list(forms.values()))
    if "count" not in parameters:
        fail(f"plural message '{path}' must use {{count}} in at least one form")
    return Message(forms, parameters)


def walk(node: dict[str, Any], prefix: str, into: dict[str, Message]) -> None:
    for name, value in node.items():
        if name == NOTE_KEY:
            if not isinstance(value, str):
                fail(f"'{prefix or 'root'}.{NOTE_KEY}' must be a string")
            continue
        if not SEGMENT.match(name):
            fail(f"'{prefix}{name}' is not a usable key segment")
        path = f"{prefix}{name}"
        if isinstance(value, str):
            if not value.strip():
                fail(f"'{path}' must not be empty")
            into[path] = Message({None: value}, parameters_of([value]))
            continue
        if not isinstance(value, dict):
            fail(f"'{path}' must be a string or an object")
        if PLURAL_KEY in value:
            into[path] = read_plural(path, value)
            continue
        walk(value, f"{path}.", into)


def load_messages(locale: str) -> dict[str, Message]:
    messages: dict[str, Message] = {}
    walk(load_locale(locale), "", messages)
    if not messages:
        fail(f"{locale_path(locale).name} holds no messages")
    return messages


def check_parity(base: dict[str, Message], locale: str, other: dict[str, Message]) -> None:
    missing = sorted(set(base) - set(other))
    extra = sorted(set(other) - set(base))
    if missing:
        fail(f"{locale} is missing keys: " + ", ".join(missing[:8]))
    if extra:
        fail(f"{locale} holds keys {BASE_LOCALE} has none of: " + ", ".join(extra[:8]))
    for key, message in base.items():
        if set(other[key].parameters) - set(message.parameters):
            fail(f"'{key}' in {locale} uses placeholders {BASE_LOCALE} has none of")


def load_catalog() -> dict[str, dict[str, Message]]:
    catalog = {locale: load_messages(locale) for locale in available_locales()}
    base = catalog[BASE_LOCALE]
    for locale, messages in catalog.items():
        if locale != BASE_LOCALE:
            check_parity(base, locale, messages)
    return catalog


def flatten(messages: dict[str, Message]) -> dict[str, str]:
    rows: dict[str, str] = {}
    for key in sorted(messages):
        message = messages[key]
        for form, text in message.forms.items():
            rows[key if form is None else f"{key}#{form}"] = text
    return rows
