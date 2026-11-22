from __future__ import annotations

from . import BANNER, BASE_LOCALE, PLUGIN_PREFIX
from .catalog import Message
from .errors import fail

KEYWORDS = {
    "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked", "class",
    "const", "continue", "decimal", "default", "delegate", "do", "double", "else", "enum", "event",
    "explicit", "extern", "false", "finally", "fixed", "float", "for", "foreach", "goto", "if",
    "implicit", "in", "int", "interface", "internal", "is", "lock", "long", "namespace", "new", "null",
    "object", "operator", "out", "override", "params", "private", "protected", "public", "readonly",
    "ref", "return", "sbyte", "sealed", "short", "sizeof", "stackalloc", "static", "string", "struct",
    "switch", "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
    "ushort", "using", "virtual", "void", "volatile", "while",
}


def member_name(key: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in key[len(PLUGIN_PREFIX):].split("."))


def table_name(locale: str) -> str:
    return locale[:1].upper() + locale[1:].replace("-", "")


def literal(text: str) -> str:
    body = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r")
    return f'"{body}"'


def plugin_keys(base: dict[str, Message]) -> list[str]:
    keys = sorted(key for key in base if key.startswith(PLUGIN_PREFIX))
    names: dict[str, str] = {}
    for key in keys:
        message = base[key]
        if message.plural:
            fail(f"'{key}' is plugin text and cannot be a plural message")
        for parameter in message.parameters:
            if parameter in KEYWORDS:
                fail(f"'{key}' uses the placeholder {{{parameter}}}, a C# keyword")
        name = member_name(key)
        if name in names:
            fail(f"'{key}' and '{names[name]}' both become UiText.{name}")
        names[name] = key
    return keys


def members(keys: list[str], base: dict[str, Message]) -> list[str]:
    lines = []
    for index, key in enumerate(keys):
        name = member_name(key)
        parameters = base[key].parameters
        if not parameters:
            lines.append(f"        public static string {name} => Pick({index});")
            continue
        signature = ", ".join(f"object {parameter}" for parameter in parameters)
        pairs = ", ".join(f'"{parameter}", {parameter}' for parameter in parameters)
        lines.append(f"        public static string {name}({signature}) => Fill(Pick({index}), {pairs});")
    return lines


def selectors(locales: list[str]) -> list[str]:
    lines = [
        "        private static bool IsLanguage(string code)",
        "        {",
        "            switch (code)",
        "            {",
    ]
    lines += [f'                case "{locale}":' for locale in locales]
    lines += [
        "                    return true;",
        "                default:",
        "                    return false;",
        "            }",
        "        }",
        "",
        "        private static string Pick(int index)",
        "        {",
        "            switch (Language)",
        "            {",
    ]
    for locale in locales:
        if locale == BASE_LOCALE:
            continue
        lines.append(f'                case "{locale}":')
        lines.append(f"                    return {table_name(locale)}[index];")
    lines += [
        "                default:",
        f"                    return {table_name(BASE_LOCALE)}[index];",
        "            }",
        "        }",
    ]
    return lines


def table(locale: str, keys: list[str], messages: dict[str, Message]) -> list[str]:
    lines = ["", f"        private static readonly string[] {table_name(locale)} =", "        {"]
    for index, key in enumerate(keys):
        comma = "," if index < len(keys) - 1 else ""
        lines.append(f"            {literal(messages[key].forms[None])}{comma}")
    lines.append("        };")
    return lines


def plugin_cs(catalog: dict[str, dict[str, Message]]) -> str:
    base = catalog[BASE_LOCALE]
    keys = plugin_keys(base)
    locales = [BASE_LOCALE] + sorted(locale for locale in catalog if locale != BASE_LOCALE)
    lines = [
        f"// {BANNER}",
        "",
        "namespace Pitrig.SimHub",
        "{",
        "    internal static partial class UiText",
        "    {",
    ]
    lines += members(keys, base)
    lines.append("")
    lines += selectors(locales)
    for locale in locales:
        lines += table(locale, keys, catalog[locale])
    lines += ["    }", "}", ""]
    return "\n".join(lines)
