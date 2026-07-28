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

OLDEST_SCHEMA_VERSION = 1
SCHEMA_VERSION = 4
WIDGET_ENABLE_SCHEMA_VERSION = 2
GEAR_WIDGET_SCHEMA_VERSION = 3
SPEED_WIDGET_SCHEMA_VERSION = 4
TEXT_CAPACITY = 16

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
ESTIMATED_UNAVAILABLE = {"hide": 0, "placeholder": 1}
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

PROFILE_PATHS = {
    "t_display_s3": Path("config/profiles/t-display-s3.json"),
    "guition_esp32_4848s040": Path(
        "config/profiles/guition-esp32-4848s040.json"
    ),
}
WIDGET_NAMES = (
    "lap_timer",
    "delta_time",
    "estimated_lap_time",
    "gear",
    "speed",
)


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

    def text(self, value: str) -> None:
        encoded = value.encode("ascii")
        if len(encoded) >= TEXT_CAPACITY:
            raise ValueError(
                f"text must be at most {TEXT_CAPACITY - 1} ASCII characters"
            )
        self.data.extend(encoded)
        self.data.extend(b"\0" * (TEXT_CAPACITY - len(encoded)))


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

    def text(self) -> str:
        raw = self.payload[self.position : self.position + TEXT_CAPACITY]
        if len(raw) != TEXT_CAPACITY:
            raise ValueError("configuration text is truncated")
        self.position += TEXT_CAPACITY
        try:
            terminator = raw.index(0)
        except ValueError as error:
            raise ValueError("configuration text has no terminator") from error
        return raw[:terminator].decode("ascii")

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
    writer.rgb(style["background_color_rgb"], "region background color")
    writer.rgb(style["border_color_rgb"], "region border color")
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
            "background_color_rgb": reader.rgb(),
            "border_color_rgb": reader.rgb(),
            "border_width_px": reader.get("H"),
            "radius_px": reader.get("H"),
            "visible": reader.boolean(),
        },
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
    writer.text(delta["placeholder"])
    writer.boolean(delta["scale"]["enabled"])
    writer.boolean(delta["scale"]["show_sign"])
    writer.put("i", delta["scale"]["range_ms"])

    estimated = config["estimated_lap_time"]
    writer.enum(
        ESTIMATED_UNAVAILABLE,
        estimated["unavailable_behavior"],
        "estimated lap unavailable behavior",
    )
    writer.text(estimated["placeholder"])

    dashboard = config["dashboard"]
    writer.enum(DASHBOARD_MODES, dashboard["mode"], "dashboard mode")
    regions = dashboard["regions"]
    if len(regions) != 1:
        raise ValueError("configuration requires exactly one dashboard region")
    writer.put("B", len(regions))
    _encode_region(writer, regions[0])

    lap_widget = dashboard["lap_timer"]
    writer.boolean(lap_widget.get("enabled", True))
    _encode_font(writer, lap_widget["font"])
    _encode_placement(writer, lap_widget["placement"])
    writer.rgb(lap_widget["text_color_rgb"], "lap timer text color")

    delta_widget = dashboard["delta_time"]
    writer.boolean(delta_widget.get("enabled", True))
    _encode_font(writer, delta_widget["font"])
    _encode_placement(writer, delta_widget["placement"])
    writer.rgb(delta_widget["faster_color_rgb"], "delta faster color")
    writer.rgb(delta_widget["slower_color_rgb"], "delta slower color")
    writer.rgb(delta_widget["neutral_color_rgb"], "delta neutral color")
    writer.put("H", delta_widget["scale"]["vertical_padding_px"])
    writer.put("H", delta_widget["scale"]["border_width_px"])
    writer.put("H", delta_widget["scale"]["border_radius_px"])

    estimated_widget = dashboard["estimated_lap_time"]
    writer.boolean(estimated_widget.get("enabled", True))
    _encode_font(writer, estimated_widget["font"])
    _encode_placement(writer, estimated_widget["placement"])
    writer.rgb(
        estimated_widget["text_color_rgb"], "estimated lap time text color"
    )

    gear_widget = dashboard["gear"]
    writer.boolean(gear_widget["enabled"])
    _encode_font(writer, gear_widget["font"])
    _encode_placement(writer, gear_widget["placement"])
    padding = gear_widget["padding"]
    for field in ("left", "top", "right", "bottom"):
        writer.put("H", padding[field])
    border = gear_widget["border"]
    writer.rgb(border["color_rgb"], "gear border color")
    writer.put("H", border["width_px"])
    writer.put("H", border["radius_px"])
    writer.rgb(gear_widget["text_color_rgb"], "gear text color")
    writer.rgb(gear_widget["background_color_rgb"], "gear background color")

    speed_widget = dashboard["speed"]
    writer.boolean(speed_widget["enabled"])
    _encode_font(writer, speed_widget["font"])
    _encode_placement(writer, speed_widget["placement"])
    writer.rgb(speed_widget["text_color_rgb"], "speed text color")
    return bytes(writer.data)


def decode_configuration(payload: bytes) -> dict[str, Any]:
    reader = Reader(payload)
    schema = reader.get("H")
    if not OLDEST_SCHEMA_VERSION <= schema <= SCHEMA_VERSION:
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
            "placeholder": reader.text(),
            "scale": {
                "enabled": reader.boolean(),
                "show_sign": reader.boolean(),
                "range_ms": reader.get("i"),
            },
        },
        "estimated_lap_time": {
            "unavailable_behavior": reader.enum(
                ESTIMATED_UNAVAILABLE,
                "estimated lap unavailable behavior",
            ),
            "placeholder": reader.text(),
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
        "enabled": (
            reader.boolean()
            if schema >= WIDGET_ENABLE_SCHEMA_VERSION
            else True
        ),
        "font": _decode_font(reader),
        "placement": _decode_placement(reader),
        "text_color_rgb": reader.rgb(),
    }
    dashboard["delta_time"] = {
        "enabled": (
            reader.boolean()
            if schema >= WIDGET_ENABLE_SCHEMA_VERSION
            else True
        ),
        "font": _decode_font(reader),
        "placement": _decode_placement(reader),
        "faster_color_rgb": reader.rgb(),
        "slower_color_rgb": reader.rgb(),
        "neutral_color_rgb": reader.rgb(),
        "scale": {
            "vertical_padding_px": reader.get("H"),
            "border_width_px": reader.get("H"),
            "border_radius_px": reader.get("H"),
        },
    }
    dashboard["estimated_lap_time"] = {
        "enabled": (
            reader.boolean()
            if schema >= WIDGET_ENABLE_SCHEMA_VERSION
            else True
        ),
        "font": _decode_font(reader),
        "placement": _decode_placement(reader),
        "text_color_rgb": reader.rgb(),
    }
    if schema >= GEAR_WIDGET_SCHEMA_VERSION:
        dashboard["gear"] = {
            "enabled": reader.boolean(),
            "font": _decode_font(reader),
            "placement": _decode_placement(reader),
            "padding": {
                "left": reader.get("H"),
                "top": reader.get("H"),
                "right": reader.get("H"),
                "bottom": reader.get("H"),
            },
            "border": {
                "color_rgb": reader.rgb(),
                "width_px": reader.get("H"),
                "radius_px": reader.get("H"),
            },
            "text_color_rgb": reader.rgb(),
            "background_color_rgb": reader.rgb(),
        }
    else:
        dashboard["gear"] = {
            "enabled": result["board"]["id"] == "guition_esp32_4848s040",
            "font": {"family": "montserrat", "size_px": 48},
            "placement": {
                "region_id": 0,
                "anchor": "top_center",
                "offset_x": 0,
                "offset_y": 16,
                "width": 120,
                "height": 120,
            },
            "padding": {"left": 8, "top": 8, "right": 8, "bottom": 8},
            "border": {
                "color_rgb": "#AEAEAE",
                "width_px": 2,
                "radius_px": 12,
            },
            "text_color_rgb": "#E8E8E8",
            "background_color_rgb": "#0B0B0B",
        }
    if schema >= SPEED_WIDGET_SCHEMA_VERSION:
        dashboard["speed"] = {
            "enabled": reader.boolean(),
            "font": _decode_font(reader),
            "placement": _decode_placement(reader),
            "text_color_rgb": reader.rgb(),
        }
    else:
        dashboard["speed"] = {
            "enabled": result["board"]["id"] == "guition_esp32_4848s040",
            "font": {"family": "montserrat", "size_px": 48},
            "placement": {
                "region_id": 0,
                "anchor": "bottom_center",
                "offset_x": 0,
                "offset_y": -24,
                "width": 180,
                "height": 64,
            },
            "text_color_rgb": "#E8E8E8",
        }
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
            line = self.serial.readline().decode("ascii", errors="replace").strip()
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


def _normalize_sparse(value: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "schema_version",
        "board",
        "telemetry_transport",
        "lap_timer",
        "delta_time",
        "estimated_lap_time",
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
    value.pop("schema_version", None)
    result.pop("schema_version", None)

    for section in (
        "telemetry_transport",
        "lap_timer",
        "delta_time",
        "estimated_lap_time",
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
            unknown_widgets = set(widgets) - set(WIDGET_NAMES)
            if unknown_widgets:
                name = sorted(unknown_widgets)[0]
                raise ValueError(f"unknown dashboard widget: {name}")
            for name in WIDGET_NAMES:
                result["dashboard"][name]["enabled"] = False
            for name, widget_patch in widgets.items():
                if not isinstance(widget_patch, dict):
                    raise ValueError(
                        f"dashboard.widgets.{name} must be an object"
                    )
                if "enabled" in widget_patch:
                    raise ValueError(
                        f"dashboard.widgets.{name}.enabled is presence-driven"
                    )
                result["dashboard"][name]["enabled"] = True
                _merge_known(
                    result["dashboard"][name],
                    widget_patch,
                    f"dashboard.widgets.{name}",
                )

    return result


def _load(path: Path) -> dict[str, Any]:
    value = _read_json_object(path)
    if isinstance(value.get("board"), dict):
        value.pop("schema_version", None)
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

    # macOS exposes some serial devices through both tty.* and cu.* aliases.
    # Prefer cu.* and probe each physical-looking path only once.
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
        ValueError,
        RuntimeError,
        TimeoutError,
        struct.error,
    ) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
