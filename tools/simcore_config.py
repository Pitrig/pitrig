#!/usr/bin/env python3
"""Configure a SimCore device over its telemetry serial port."""

from __future__ import annotations

import argparse
import copy
import json
import struct
import sys
import time
from pathlib import Path
from typing import Any, Optional

SCHEMA_VERSION = 0
MAXIMUM_TEXT_WIDGETS = 16
MAXIMUM_PAYLOAD_SIZE = 2560
DELTA_TEXT_CAPACITY = 16
TELEMETRY_FIELD_NAME_CAPACITY = 40
TITLE_CAPACITY = 16
UNAVAILABLE_TEXT_CAPACITY = 16

BOARD_IDS = {
    "t_display_s3": 0,
    "guition_esp32_4848s040": 1,
}
TRANSPORT_IDS = {
    "board_default": 0,
    "native_usb_cdc": 1,
    "uart": 2,
}
DELTA_UNAVAILABLE = {"hide": 0, "placeholder": 1, "zero": 2}
DASHBOARD_MODES = {"normal": 0, "display_diagnostics": 1}
FONT_FAMILIES = {"roboto_mono": 0, "lcd": 1, "montserrat": 2}
ANCHORS = {
    "top_left": 0,
    "top_center": 1,
    "top_right": 2,
    "left_center": 3,
    "center": 4,
    "right_center": 5,
    "bottom_left": 6,
    "bottom_center": 7,
    "bottom_right": 8,
}
TELEMETRY_FIELDS = {
    "vehicle.speed",
    "engine.rpm",
    "transmission.gear",
    "session.lap.current_time",
    "session.lap.best_time",
    "vehicle.fuel.level",
    "session.lap.delta",
    "session.lap.estimated_time",
    "vehicle.aids.traction_control",
    "vehicle.aids.abs",
    "vehicle.brake_bias",
    "vehicle.fuel.average_consumption",
    "vehicle.fuel.laps_remaining",
}
TEXT_ALIGNMENTS = {"left": 0, "center": 1, "right": 2}

PROFILE_PATHS = {
    "t_display_s3": Path("config/profiles/t-display-s3.json"),
    "guition_esp32_4848s040": Path(
        "config/profiles/guition-esp32-4848s040.json"
    ),
}

TEXT_WIDGET_DEFAULT: dict[str, Any] = {
    "binding": "vehicle.speed",
    "placement": {
        "region_id": 0,
        "anchor": "center",
        "offset_x": 0,
        "offset_y": 0,
        "width": 0,
        "height": 0,
    },
    "padding": {"left": 0, "top": 0, "right": 0, "bottom": 0},
    "border": {
        "color": "#AEAEAE",
        "width_px": 0,
        "radius_px": 0,
    },
    "title": {
        "text": "",
        "font": {"family": "montserrat", "size_px": 10},
        "color": "#E8E8E8",
        "offset_y_px": 0,
    },
    "value": {
        "font": {"family": "montserrat", "size_px": 48},
        "color": "#E8E8E8",
        "alignment": "center",
        "unavailable_text": "--",
    },
    "background_color": None,
}


def _reverse(mapping: dict[str, int], value: int, field: str) -> str:
    for name, encoded in mapping.items():
        if encoded == value:
            return name
    raise ValueError(f"unknown {field} value: {value}")


def _parse_rgb(value: Any, field: str) -> int:
    if (
        not isinstance(value, str)
        or len(value) != 7
        or value[0] != "#"
    ):
        raise ValueError(f"{field} must use the #RRGGBB format")
    try:
        return int(value[1:], 16)
    except ValueError as error:
        raise ValueError(f"{field} must use the #RRGGBB format") from error


def _format_rgb(value: int) -> str:
    return f"#{value:06X}"


class Writer:
    def __init__(self) -> None:
        self.data = bytearray()

    def put(self, fmt: str, value: Any) -> None:
        self.data.extend(struct.pack("<" + fmt, value))

    def enum(self, mapping: dict[str, int], value: str, field: str) -> None:
        try:
            self.put("B", mapping[value])
        except KeyError as error:
            raise ValueError(f"invalid {field}: {value}") from error

    def boolean(self, value: Any) -> None:
        if not isinstance(value, bool):
            raise ValueError(f"expected boolean, got {value!r}")
        self.put("B", int(value))

    def rgb(self, value: Any, field: str) -> None:
        self.put("I", _parse_rgb(value, field))

    def optional_rgb(self, value: Any, field: str) -> None:
        if value is None:
            self.put("I", 0xFFFFFFFF)
            return
        self.rgb(value, field)

    def text(self, value: Any, capacity: int, field: str) -> None:
        if not isinstance(value, str):
            raise ValueError(f"{field} must be a string")
        encoded = value.encode("utf-8")
        if len(encoded) >= capacity:
            raise ValueError(
                f"{field} must use at most {capacity - 1} UTF-8 bytes"
            )
        self.data.extend(encoded)
        self.data.extend(b"\0" * (capacity - len(encoded)))


class Reader:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.position = 0

    def get(self, fmt: str) -> Any:
        size = struct.calcsize("<" + fmt)
        if self.position + size > len(self.payload):
            raise ValueError("configuration payload is truncated")
        value = struct.unpack_from("<" + fmt, self.payload, self.position)[0]
        self.position += size
        return value

    def enum(self, mapping: dict[str, int], field: str) -> str:
        return _reverse(mapping, self.get("B"), field)

    def boolean(self) -> bool:
        value = self.get("B")
        if value not in (0, 1):
            raise ValueError(f"invalid boolean value: {value}")
        return bool(value)

    def rgb(self) -> str:
        return _format_rgb(self.get("I"))

    def optional_rgb(self) -> Optional[str]:
        value = self.get("I")
        return None if value == 0xFFFFFFFF else _format_rgb(value)

    def text(self, capacity: int, field: str) -> str:
        raw = self.payload[self.position : self.position + capacity]
        if len(raw) != capacity:
            raise ValueError(f"{field} is truncated")
        self.position += capacity
        try:
            terminator = raw.index(0)
        except ValueError as error:
            raise ValueError(f"{field} has no terminator") from error
        return raw[:terminator].decode("utf-8")

    def finish(self) -> None:
        if self.position != len(self.payload):
            raise ValueError("configuration payload has trailing bytes")


def _encode_font(writer: Writer, value: dict[str, Any]) -> None:
    writer.enum(FONT_FAMILIES, value["family"], "font family")
    writer.put("H", value["size_px"])


def _decode_font(reader: Reader) -> dict[str, Any]:
    return {
        "family": reader.enum(FONT_FAMILIES, "font family"),
        "size_px": reader.get("H"),
    }


def _encode_placement(writer: Writer, value: dict[str, Any]) -> None:
    writer.put("H", value["region_id"])
    writer.enum(ANCHORS, value["anchor"], "anchor")
    writer.put("i", value["offset_x"])
    writer.put("i", value["offset_y"])
    writer.put("i", value["width"])
    writer.put("i", value["height"])


def _decode_placement(reader: Reader) -> dict[str, Any]:
    return {
        "region_id": reader.get("H"),
        "anchor": reader.enum(ANCHORS, "anchor"),
        "offset_x": reader.get("i"),
        "offset_y": reader.get("i"),
        "width": reader.get("i"),
        "height": reader.get("i"),
    }


def _encode_region(writer: Writer, value: dict[str, Any]) -> None:
    bounds = value["bounds"]
    padding = value["padding"]
    style = value["style"]
    writer.put("H", value["id"])
    for field in ("x", "y", "width", "height"):
        writer.put("i", bounds[field])
    for field in ("left", "top", "right", "bottom"):
        writer.put("H", padding[field])
    writer.rgb(style["background_color"], "region background color")
    writer.rgb(style["border_color"], "region border color")
    writer.put("H", style["border_width_px"])
    writer.put("H", style["radius_px"])
    writer.boolean(style["visible"])


def _decode_region(reader: Reader) -> dict[str, Any]:
    return {
        "id": reader.get("H"),
        "bounds": {
            "x": reader.get("i"),
            "y": reader.get("i"),
            "width": reader.get("i"),
            "height": reader.get("i"),
        },
        "padding": {
            "left": reader.get("H"),
            "top": reader.get("H"),
            "right": reader.get("H"),
            "bottom": reader.get("H"),
        },
        "style": {
            "background_color": reader.rgb(),
            "border_color": reader.rgb(),
            "border_width_px": reader.get("H"),
            "radius_px": reader.get("H"),
            "visible": reader.boolean(),
        },
    }


def _encode_text_widget(
    writer: Writer, widget: dict[str, Any], index: int
) -> None:
    prefix = f"dashboard.text_widgets[{index}]"
    if widget["binding"] not in TELEMETRY_FIELDS:
        raise ValueError(
            f"invalid {prefix}.binding: {widget['binding']}"
        )
    writer.text(
        widget["binding"],
        TELEMETRY_FIELD_NAME_CAPACITY,
        f"{prefix}.binding",
    )
    _encode_placement(writer, widget["placement"])
    for field in ("left", "top", "right", "bottom"):
        writer.put("H", widget["padding"][field])
    writer.rgb(widget["border"]["color"], f"{prefix}.border.color")
    writer.put("H", widget["border"]["width_px"])
    writer.put("H", widget["border"]["radius_px"])
    writer.text(
        widget["title"]["text"],
        TITLE_CAPACITY,
        f"{prefix}.title.text",
    )
    _encode_font(writer, widget["title"]["font"])
    writer.rgb(widget["title"]["color"], f"{prefix}.title.color")
    writer.put("h", widget["title"]["offset_y_px"])
    _encode_font(writer, widget["value"]["font"])
    writer.rgb(widget["value"]["color"], f"{prefix}.value.color")
    writer.enum(
        TEXT_ALIGNMENTS,
        widget["value"]["alignment"],
        f"{prefix}.value.alignment",
    )
    writer.text(
        widget["value"]["unavailable_text"],
        UNAVAILABLE_TEXT_CAPACITY,
        f"{prefix}.value.unavailable_text",
    )
    writer.optional_rgb(
        widget["background_color"], f"{prefix}.background_color"
    )


def _decode_text_widget(reader: Reader) -> dict[str, Any]:
    return {
        "binding": reader.text(
            TELEMETRY_FIELD_NAME_CAPACITY, "telemetry binding"
        ),
        "placement": _decode_placement(reader),
        "padding": {
            "left": reader.get("H"),
            "top": reader.get("H"),
            "right": reader.get("H"),
            "bottom": reader.get("H"),
        },
        "border": {
            "color": reader.rgb(),
            "width_px": reader.get("H"),
            "radius_px": reader.get("H"),
        },
        "title": {
            "text": reader.text(TITLE_CAPACITY, "widget title"),
            "font": _decode_font(reader),
            "color": reader.rgb(),
            "offset_y_px": reader.get("h"),
        },
        "value": {
            "font": _decode_font(reader),
            "color": reader.rgb(),
            "alignment": reader.enum(TEXT_ALIGNMENTS, "text alignment"),
            "unavailable_text": reader.text(
                UNAVAILABLE_TEXT_CAPACITY, "unavailable text"
            ),
        },
        "background_color": reader.optional_rgb(),
    }


def encode_configuration(config: dict[str, Any]) -> bytes:
    writer = Writer()
    writer.put("H", SCHEMA_VERSION)
    writer.enum(BOARD_IDS, config["board"]["id"], "board")

    telemetry = config["telemetry_transport"]
    writer.enum(TRANSPORT_IDS, telemetry["id"], "telemetry transport")
    uart = telemetry["uart"]
    writer.put("i", uart["port"])
    writer.put("i", uart["tx_pin"])
    writer.put("i", uart["rx_pin"])
    writer.put("I", uart["baud_rate"])
    writer.boolean(uart["silence_esp_logs"])

    lap_timer = config["lap_timer"]
    writer.boolean(lap_timer["telemetry_only"])
    writer.put("I", lap_timer["telemetry_timeout_ms"])

    delta = config["delta_time"]
    writer.enum(
        DELTA_UNAVAILABLE,
        delta["unavailable_behavior"],
        "delta unavailable behavior",
    )
    writer.text(
        delta["placeholder"],
        DELTA_TEXT_CAPACITY,
        "delta_time.placeholder",
    )
    writer.boolean(delta["scale"]["enabled"])
    writer.boolean(delta["scale"]["show_sign"])
    writer.put("i", delta["scale"]["range_ms"])

    dashboard = config["dashboard"]
    writer.enum(DASHBOARD_MODES, dashboard["mode"], "dashboard mode")
    regions = dashboard["regions"]
    if len(regions) != 1:
        raise ValueError("configuration requires exactly one dashboard region")
    writer.put("B", len(regions))
    _encode_region(writer, regions[0])

    lap_widget = dashboard["lap_timer"]
    writer.boolean(lap_widget["enabled"])
    _encode_font(writer, lap_widget["font"])
    _encode_placement(writer, lap_widget["placement"])
    writer.rgb(lap_widget["text_color"], "lap timer text color")

    delta_widget = dashboard["delta_time"]
    writer.boolean(delta_widget["enabled"])
    _encode_font(writer, delta_widget["font"])
    _encode_placement(writer, delta_widget["placement"])
    writer.rgb(delta_widget["faster_color"], "delta faster color")
    writer.rgb(delta_widget["slower_color"], "delta slower color")
    writer.rgb(delta_widget["neutral_color"], "delta neutral color")
    writer.put("H", delta_widget["scale"]["vertical_padding_px"])
    writer.put("H", delta_widget["scale"]["border_width_px"])
    writer.put("H", delta_widget["scale"]["border_radius_px"])

    text_widgets = dashboard["text_widgets"]
    if (
        not isinstance(text_widgets, list)
        or len(text_widgets) > MAXIMUM_TEXT_WIDGETS
    ):
        raise ValueError(
            f"dashboard.text_widgets must contain at most "
            f"{MAXIMUM_TEXT_WIDGETS} objects"
        )
    writer.put("B", len(text_widgets))
    for index, widget in enumerate(text_widgets):
        _encode_text_widget(writer, widget, index)
    payload = bytes(writer.data)
    if len(payload) > MAXIMUM_PAYLOAD_SIZE:
        raise ValueError(
            f"configuration payload exceeds {MAXIMUM_PAYLOAD_SIZE} bytes"
        )
    return payload


def decode_configuration(payload: bytes) -> dict[str, Any]:
    reader = Reader(payload)
    schema = reader.get("H")
    if schema != SCHEMA_VERSION:
        raise ValueError(f"unsupported schema version: {schema}")

    result: dict[str, Any] = {
        "schema_version": schema,
        "board": {"id": reader.enum(BOARD_IDS, "board")},
        "telemetry_transport": {
            "id": reader.enum(TRANSPORT_IDS, "telemetry transport"),
            "uart": {
                "port": reader.get("i"),
                "tx_pin": reader.get("i"),
                "rx_pin": reader.get("i"),
                "baud_rate": reader.get("I"),
                "silence_esp_logs": reader.boolean(),
            },
        },
        "lap_timer": {
            "telemetry_only": reader.boolean(),
            "telemetry_timeout_ms": reader.get("I"),
        },
        "delta_time": {
            "unavailable_behavior": reader.enum(
                DELTA_UNAVAILABLE, "delta unavailable behavior"
            ),
            "placeholder": reader.text(
                DELTA_TEXT_CAPACITY, "delta placeholder"
            ),
            "scale": {
                "enabled": reader.boolean(),
                "show_sign": reader.boolean(),
                "range_ms": reader.get("i"),
            },
        },
    }
    dashboard: dict[str, Any] = {
        "mode": reader.enum(DASHBOARD_MODES, "dashboard mode"),
    }
    region_count = reader.get("B")
    dashboard["regions"] = [
        _decode_region(reader) for _ in range(region_count)
    ]
    dashboard["lap_timer"] = {
        "enabled": reader.boolean(),
        "font": _decode_font(reader),
        "placement": _decode_placement(reader),
        "text_color": reader.rgb(),
    }
    dashboard["delta_time"] = {
        "enabled": reader.boolean(),
        "font": _decode_font(reader),
        "placement": _decode_placement(reader),
        "faster_color": reader.rgb(),
        "slower_color": reader.rgb(),
        "neutral_color": reader.rgb(),
        "scale": {
            "vertical_padding_px": reader.get("H"),
            "border_width_px": reader.get("H"),
            "border_radius_px": reader.get("H"),
        },
    }
    text_widget_count = reader.get("B")
    if text_widget_count > MAXIMUM_TEXT_WIDGETS:
        raise ValueError("configuration contains too many text widgets")
    dashboard["text_widgets"] = [
        _decode_text_widget(reader) for _ in range(text_widget_count)
    ]
    result["dashboard"] = dashboard
    reader.finish()
    return result


class Device:
    def __init__(self, port: str, baud_rate: int, timeout: float) -> None:
        try:
            import serial  # type: ignore[import-not-found]
        except ImportError as error:
            raise RuntimeError(
                "pyserial is required; activate the ESP-IDF Python "
                "environment or install tools/requirements.txt in a venv"
            ) from error
        try:
            self.serial = serial.Serial(
                port=port, baudrate=baud_rate, timeout=timeout
            )
        except serial.SerialException as error:
            raise RuntimeError(
                f"cannot open serial port {port}: {error}"
            ) from error
        self.port = port

    def close(self) -> None:
        self.serial.close()

    def probe_info(self, duration: float) -> Optional[str]:
        original_timeout = self.serial.timeout
        self.serial.timeout = min(0.2, duration)
        deadline = time.monotonic() + duration
        next_request = 0.0
        try:
            self.serial.reset_input_buffer()
            while time.monotonic() < deadline:
                now = time.monotonic()
                if now >= next_request:
                    self.serial.write(b"@SC:INFO\n")
                    self.serial.flush()
                    next_request = now + 0.5
                line = (
                    self.serial.readline()
                    .decode("ascii", errors="replace")
                    .strip()
                )
                if line.startswith("@SC:OK:INFO:"):
                    return line
        finally:
            self.serial.timeout = original_timeout
        return None

    def command(self, command: str) -> str:
        self.serial.reset_input_buffer()
        self.serial.write(f"@SC:{command}\n".encode("ascii"))
        self.serial.flush()
        deadline = time.monotonic() + self.serial.timeout
        while time.monotonic() < deadline:
            line = (
                self.serial.readline()
                .decode("ascii", errors="replace")
                .strip()
            )
            if line.startswith("@SC:"):
                if line.startswith("@SC:ERR:"):
                    raise RuntimeError(line.removeprefix("@SC:ERR:"))
                return line
        raise TimeoutError("device did not return a SimCore control response")


def _read_json_object(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as source:
        value = json.load(source)
    if not isinstance(value, dict):
        raise ValueError("configuration root must be an object")
    return value


def _merge_known(
    target: dict[str, Any],
    patch: dict[str, Any],
    path: str,
) -> None:
    for key, value in patch.items():
        field = f"{path}.{key}" if path else key
        if key not in target:
            raise ValueError(f"unknown configuration field: {field}")
        current = target[key]
        if isinstance(current, dict):
            if not isinstance(value, dict):
                raise ValueError(f"{field} must be an object")
            _merge_known(current, value, field)
        else:
            target[key] = copy.deepcopy(value)


def _normalize_text_widget(
    value: Any,
    path: str,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    if "binding" not in value:
        raise ValueError(f"{path}.binding is required")
    result = copy.deepcopy(TEXT_WIDGET_DEFAULT)
    _merge_known(result, value, path)
    return result


def _normalize_sparse(value: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "schema_version",
        "board",
        "telemetry_transport",
        "lap_timer",
        "delta_time",
        "dashboard",
    }
    unknown = set(value) - allowed
    if unknown:
        raise ValueError(
            f"unknown configuration field: {sorted(unknown)[0]}"
        )

    board = value.get("board")
    if not isinstance(board, str) or board not in PROFILE_PATHS:
        raise ValueError(
            "sparse configuration requires a supported string board id"
        )
    profile_path = Path(__file__).resolve().parent.parent / PROFILE_PATHS[board]
    result = _read_json_object(profile_path)

    for section in (
        "telemetry_transport",
        "lap_timer",
        "delta_time",
    ):
        if section not in value:
            continue
        patch = value[section]
        if not isinstance(patch, dict):
            raise ValueError(f"{section} must be an object")
        _merge_known(result[section], patch, section)

    dashboard_patch = value.get("dashboard")
    if dashboard_patch is not None:
        if not isinstance(dashboard_patch, dict):
            raise ValueError("dashboard must be an object")
        unknown_dashboard = set(dashboard_patch) - {
            "mode",
            "regions",
            "widgets",
        }
        if unknown_dashboard:
            field = sorted(unknown_dashboard)[0]
            raise ValueError(f"unknown configuration field: dashboard.{field}")
        if "mode" in dashboard_patch:
            result["dashboard"]["mode"] = dashboard_patch["mode"]
        if "regions" in dashboard_patch:
            regions = dashboard_patch["regions"]
            if (
                not isinstance(regions, list)
                or len(regions) != 1
                or not isinstance(regions[0], dict)
            ):
                raise ValueError(
                    "dashboard.regions must contain exactly one object"
                )
            _merge_known(
                result["dashboard"]["regions"][0],
                regions[0],
                "dashboard.regions[0]",
            )

        if "widgets" in dashboard_patch:
            widgets = dashboard_patch["widgets"]
            if not isinstance(widgets, dict):
                raise ValueError("dashboard.widgets must be an object")
            unknown_widgets = set(widgets) - {
                "lap_timer",
                "delta_time",
                "text",
            }
            if unknown_widgets:
                name = sorted(unknown_widgets)[0]
                raise ValueError(f"unknown dashboard widget: {name}")

            for name in ("lap_timer", "delta_time"):
                result["dashboard"][name]["enabled"] = name in widgets
                if name not in widgets:
                    continue
                patch = widgets[name]
                if not isinstance(patch, dict):
                    raise ValueError(
                        f"dashboard.widgets.{name} must be an object"
                    )
                if "enabled" in patch:
                    raise ValueError(
                        f"dashboard.widgets.{name}.enabled is presence-driven"
                    )
                _merge_known(
                    result["dashboard"][name],
                    patch,
                    f"dashboard.widgets.{name}",
                )

            text_widgets = widgets.get("text", [])
            if (
                not isinstance(text_widgets, list)
                or len(text_widgets) > MAXIMUM_TEXT_WIDGETS
            ):
                raise ValueError(
                    f"dashboard.widgets.text must contain at most "
                    f"{MAXIMUM_TEXT_WIDGETS} objects"
                )
            result["dashboard"]["text_widgets"] = [
                _normalize_text_widget(
                    item, f"dashboard.widgets.text[{index}]"
                )
                for index, item in enumerate(text_widgets)
            ]

    return result


def _load(path: Path) -> dict[str, Any]:
    value = _read_json_object(path)
    if isinstance(value.get("board"), dict):
        if value.get("schema_version") != SCHEMA_VERSION:
            raise ValueError(
                f"complete configuration must use schema {SCHEMA_VERSION}"
            )
        return value
    return _normalize_sparse(value)


def _payload_response(response: str) -> bytes:
    prefix = "@SC:OK:CONFIG:"
    if not response.startswith(prefix):
        raise RuntimeError(f"unexpected device response: {response}")
    return bytes.fromhex(response.removeprefix(prefix))


def _usb_serial_ports() -> list[str]:
    try:
        from serial.tools import list_ports  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError(
            "pyserial is required; activate the ESP-IDF Python "
            "environment or install tools/requirements.txt in a venv"
        ) from error

    candidates = []
    for port in list_ports.comports():
        device = port.device
        name = device.lower()
        if port.vid is not None or name.startswith(
            (
                "/dev/cu.usb",
                "/dev/tty.usb",
                "/dev/ttyacm",
                "/dev/ttyusb",
            )
        ):
            candidates.append(device)

    candidates.sort(key=lambda value: (not value.startswith("/dev/cu."), value))
    unique: dict[str, str] = {}
    for device in candidates:
        identity = device
        if device.startswith("/dev/cu."):
            identity = "/dev/serial." + device.removeprefix("/dev/cu.")
        elif device.startswith("/dev/tty."):
            identity = "/dev/serial." + device.removeprefix("/dev/tty.")
        unique.setdefault(identity, device)
    return list(unique.values())


def _autodetect_device(
    baud_rate: int, timeout: float
) -> tuple[Device, str]:
    ports = _usb_serial_ports()
    if not ports:
        raise RuntimeError("no USB serial ports found")

    matches: list[tuple[Device, str]] = []
    unavailable: list[str] = []
    for port in ports:
        device: Optional[Device] = None
        try:
            device = Device(port, baud_rate, timeout)
            response = device.probe_info(timeout)
        except (OSError, RuntimeError):
            if device is not None:
                device.close()
            unavailable.append(port)
            continue
        if response is None:
            device.close()
            continue
        matches.append((device, response))

    if len(matches) == 1:
        return matches[0]

    for device, _ in matches:
        device.close()
    if len(matches) > 1:
        detected = ", ".join(device.port for device, _ in matches)
        raise RuntimeError(
            f"multiple SimCore devices detected: {detected}; use --port"
        )

    checked = ", ".join(ports)
    detail = (
        f" Ports in use: {', '.join(unavailable)}."
        if unavailable
        else ""
    )
    raise RuntimeError(
        f"no SimCore device responded on: {checked}."
        f"{detail} Stop ESP-IDF Monitor or SimHub and try again."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--port",
        help="serial port; automatically detected when omitted",
    )
    parser.add_argument("--baud", type=int, default=115_200)
    parser.add_argument("--timeout", type=float, default=3.0)
    subparsers = parser.add_subparsers(dest="action", required=True)
    subparsers.add_parser("info")
    subparsers.add_parser("show")
    for name in ("validate", "apply"):
        command = subparsers.add_parser(name)
        command.add_argument("config", type=Path)
        if name == "apply":
            command.add_argument("--no-reboot", action="store_true")
    subparsers.add_parser("reset").add_argument(
        "--no-reboot", action="store_true"
    )
    subparsers.add_parser("reboot")
    args = parser.parse_args()
    if args.baud <= 0:
        parser.error("--baud must be greater than zero")
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")

    if args.port is None:
        device, info = _autodetect_device(args.baud, args.timeout)
        print(f"Using SimCore device on {device.port}: {info}", file=sys.stderr)
    else:
        device = Device(args.port, args.baud, args.timeout)
    try:
        if args.action == "info":
            print(device.command("INFO"))
        elif args.action == "show":
            payload = _payload_response(device.command("GET"))
            print(
                json.dumps(
                    decode_configuration(payload), indent=2, sort_keys=True
                )
            )
        elif args.action in ("validate", "apply"):
            payload = encode_configuration(_load(args.config))
            command = "VALIDATE" if args.action == "validate" else "SET"
            print(device.command(f"{command}:{payload.hex().upper()}"))
            if args.action == "apply" and not args.no_reboot:
                print(device.command("REBOOT"))
        elif args.action == "reset":
            print(device.command("RESET"))
            if not args.no_reboot:
                print(device.command("REBOOT"))
        elif args.action == "reboot":
            print(device.command("REBOOT"))
    finally:
        device.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        KeyError,
        UnicodeError,
        ValueError,
        RuntimeError,
        TimeoutError,
        struct.error,
    ) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
