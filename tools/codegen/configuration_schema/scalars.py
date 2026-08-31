from __future__ import annotations


SCALAR_CPP = {
    "int": "int",
    "int16": "std::int16_t",
    "int32": "std::int32_t",
    "uint8": "std::uint8_t",
    "uint16": "std::uint16_t",
    "uint32": "std::uint32_t",
    "float": "float",
    "bool": "bool",
    "color": "std::uint32_t",
    "optional_color": "std::uint32_t",
}


SCALAR_TS = {
    "int": "number",
    "int16": "number",
    "int32": "number",
    "uint8": "number",
    "uint16": "number",
    "uint32": "number",
    "float": "number",
    "bool": "boolean",
    "color": "RgbColor",
    "optional_color": "RgbColor",
    "text": "string",
}


SCALAR_RANGES = {
    "int16": (-32768, 32767),
    "int32": (-2147483648, 2147483647),
    "uint8": (0, 255),
    "uint16": (0, 65535),
    "uint32": (0, 4294967295),
}


SCALAR_DOC = {
    "int": "integer",
    "int16": "integer, -32768..32767",
    "int32": "integer",
    "uint8": "integer, 0..255",
    "uint16": "integer, 0..65535",
    "uint32": "integer, 0 or greater",
    "float": "number",
    "bool": "boolean",
    "color": "string `#RRGGBB`",
    "optional_color": "string `#RRGGBB`",
    "text": "string",
}
