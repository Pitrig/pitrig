from __future__ import annotations

from . import BANNER
from .source import Prefix, camel


def cpp(prefixes: list[Prefix]) -> str:
    lines = [f"// {BANNER}", "#pragma once", "", "#include <string_view>", ""]
    lines += [f'#define PITRIG_{prefix.name.upper()}_PREFIX "{prefix.value}"' for prefix in prefixes]
    lines += ["", "namespace pitrig::protocol {", ""]
    lines += [
        f"inline constexpr std::string_view k{camel(prefix.name)}Prefix = "
        f"PITRIG_{prefix.name.upper()}_PREFIX;"
        for prefix in prefixes
    ]
    lines += ["", "}", ""]
    return "\n".join(lines)


def typescript(prefixes: list[Prefix]) -> str:
    lines = [f"// {BANNER}", ""]
    lines += [f"export const {prefix.name.upper()}_PREFIX = '{prefix.value}'" for prefix in prefixes]
    lines.append("")
    return "\n".join(lines)


def csharp(prefixes: list[Prefix]) -> str:
    lines = [f"// {BANNER}", "", "namespace Pitrig.SimHub", "{", "    internal static class ControlProtocol", "    {"]
    lines += [
        f'        public const string {camel(prefix.name)}Prefix = "{prefix.value}";'
        for prefix in prefixes
    ]
    lines += ["    }", "}", ""]
    return "\n".join(lines)
