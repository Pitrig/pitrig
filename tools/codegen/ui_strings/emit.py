from __future__ import annotations

from . import BANNER
from .catalog import Message, flatten


def quote(value: str) -> str:
    body = (
        value.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )
    return f"'{body}'"


def constant_name(locale: str) -> str:
    return locale.upper().replace("-", "_") + "_UI_STRINGS"


def parameter_type(name: str) -> str:
    return "number" if name == "count" else "string | number"


def keys(messages: dict[str, Message]) -> str:
    ordered = sorted(messages)
    lines = [f"// {BANNER}", "", "export type UiStringKey ="]
    lines += [f"  | {quote(key)}" for key in ordered]
    lines.append("")

    parameterised = [key for key in ordered if messages[key].parameters]
    if parameterised:
        lines.append("export interface UiStringParameters {")
        for key in parameterised:
            fields = ", ".join(
                f"{name}: {parameter_type(name)}" for name in messages[key].parameters
            )
            lines.append(f"  {quote(key)}: {{ {fields} }}")
        lines.append("}")
    else:
        lines.append("export type UiStringParameters = Record<string, never>")
    lines.append("")
    return "\n".join(lines)


def catalog_ts(locale: str, messages: dict[str, Message]) -> str:
    rows = flatten(messages)
    lines = [
        f"// {BANNER}",
        "",
        f"export const {constant_name(locale)}: Readonly<Record<string, string>> = {{",
    ]
    lines += [f"  {quote(key)}: {quote(text)}," for key, text in rows.items()]
    lines += ["}", ""]
    return "\n".join(lines)
