#!/usr/bin/env python3
"""Choose which serial port to flash or monitor, from the ports actually present.

The chosen device goes to stdout and everything else to stderr, so a task can
capture it with $(...). macOS numbers usbmodem ports by which USB socket the
board is in, so a remembered name goes stale as soon as the cable moves; asking
is the only thing that stays correct.
"""

from __future__ import annotations

import argparse
import os
import sys

APPLICATION = "SimCore application link — telemetry and @SC:, not a flashing port"
KNOWN = {
    "303a:1001": "USB JTAG/serial debug unit — flashing and the ESP console",
    "303a:4001": APPLICATION,
    "1a86:7523": "CH340 bridge — flashing and the console",
    "1a86:55d4": "CH9102 bridge — flashing and the console",
    "10c4:ea60": "CP210x bridge — flashing and the console",
}
PREFIXES = ("cu.usbmodem", "cu.wchusbserial", "cu.usbserial", "cu.SLAB")


class Port:
    def __init__(self, device: str, description: str, identifier: str) -> None:
        self.device = device
        self.description = description
        self.identifier = identifier

    @property
    def role(self) -> str:
        known = KNOWN.get(self.identifier)
        if known:
            return known
        return self.description or "unknown device"

    @property
    def flashable(self) -> bool:
        return self.role != APPLICATION


def from_pyserial() -> list[Port] | None:
    try:
        from serial.tools import list_ports
    except ImportError:
        return None
    found = []
    for entry in list_ports.comports():
        if entry.vid is None or entry.pid is None:
            continue
        identifier = f"{entry.vid:04x}:{entry.pid:04x}"
        found.append(Port(entry.device, entry.description or "", identifier))
    return found


def from_dev() -> list[Port]:
    try:
        names = sorted(os.listdir("/dev"))
    except OSError:
        return []
    return [
        Port(f"/dev/{name}", "", "")
        for name in names
        if name.startswith(PREFIXES)
    ]


def describe(ports: list[Port], preferred: int) -> None:
    print("Serial ports:", file=sys.stderr)
    for index, port in enumerate(ports, start=1):
        marker = "*" if index == preferred else " "
        print(f" {marker}{index}) {port.device}  {port.role}", file=sys.stderr)
    print("  a) auto — let esptool find the board", file=sys.stderr)


def choose(ports: list[Port], preferred: int) -> str:
    describe(ports, preferred)
    while True:
        print(f"Port [{preferred}]: ", end="", file=sys.stderr, flush=True)
        try:
            answer = input().strip()
        except EOFError:
            return "auto"
        if not answer:
            return ports[preferred - 1].device
        if answer in ("a", "auto"):
            return "auto"
        if answer.isdigit() and 1 <= int(answer) <= len(ports):
            return ports[int(answer) - 1].device
        print(f"  {answer!r} is not one of them.", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--for", dest="purpose", default="flash",
                        choices=("flash", "monitor"))
    arguments = parser.parse_args()

    ports = from_pyserial()
    if ports is None:
        ports = from_dev()
    if not ports:
        print("No USB serial port is connected.", file=sys.stderr)
        print("Plug the board in — on the P4 that is the JTAG cable for flashing.",
              file=sys.stderr)
        raise SystemExit(1)

    override = os.environ.get("SIMCORE_PORT", "").strip()
    if override:
        print(f"Using SIMCORE_PORT={override}.", file=sys.stderr)
        print(override)
        return

    flashable = [index for index, port in enumerate(ports, start=1) if port.flashable]
    preferred = flashable[0] if flashable else 1

    if len(ports) == 1:
        print(f"One port present: {ports[0].device} ({ports[0].role}).", file=sys.stderr)
        print(ports[0].device)
        return

    if not sys.stdin.isatty():
        print("Not a terminal, so falling back to auto.", file=sys.stderr)
        print("auto")
        return

    print(choose(ports, preferred))


if __name__ == "__main__":
    main()
