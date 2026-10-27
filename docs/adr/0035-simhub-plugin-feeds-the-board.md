# ADR 0035: The SimHub Plugin Feeds the Board

Status: Accepted. Builds on [ADR 0034](0034-configurator-telemetry-bridge.md),
whose bridge becomes the configurator's side of a handover, and on
[ADR 0029](0029-single-link-and-composite-usb-gamepad.md), whose single link it
keeps. Retires the Custom Serial Device profile of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md), whose line format it
writes.

## Context

A board carries one serial link, and Windows lets one process open a COM port.
Feeding a board from SimHub meant a Custom Serial device: a profile to import, a
port to pick by hand, every field an NCalc expression under SimHub Free's 10 Hz
cap, and the configurator locked out for as long as SimHub held the port. The
plugin of ADR 0034 fed only the configurator.

Replacing the COM port was weighed and rejected. A second CDC interface does not
fit beside the gamepad on an ESP32-S3, whose USB core has four IN endpoints and
already uses three; a vendor HID or WinUSB channel would take the last one and
still leave the Guition ESP32-4848S040, which reaches the PC through a CH340, on
its UART. Bandwidth was never the reason: a native-USB board's CDC port runs at
USB speed whatever baud rate is asked for.

## Decision

**The plugin owns the board while SimHub runs.** It reads the COM ports from the
registry — `SERIALCOMM` for what is present, `Enum\USB` for the USB identity —
and opens a `303A:4001` port on its own; a port behind a USB-UART bridge only
once the configurator has handed it back as a Pitrig board, so an Arduino on a
CH340 is never opened. It identifies the board with `@PR:INFO`, reads
`@PR:GET:dashboard` and `@PR:GET:modules`, and streams the fields those
documents bind — every `binding`, `vehicle.speed` because it is a text source's
default, and `session.lap.current_time` when any modifier is present — in the
line format of ADR 0006: changed values only, with every value repeated within
a second, spread across it. A board it fed before gets that session's fields at
once, while the documents are read beside the stream, and a request the board
answers `busy` is sent again. Each board has a thread of its own and is written
through Win32 directly with DTR and RTS off; a board slow to take data misses
updates rather than receiving them late, and is dropped only once a write has
waited two seconds. A field is evaluated once, on SimHub's thread, for every
consumer. Boards and the configurator link live in
one process-wide hub, because SimHub rebuilds its plugins on a game change.

**The configurator takes a board over and relays.** Before it opens any port the
configurator leases it: its once-a-second request names the port in `hold=`,
the plugin lets go and acknowledges the request's sequence, and the configurator
opens the port and forwards the plugin's stream as ADR 0034 describes. A lease
outlives a reboot and the scan's second open. Disconnecting hands the board back
with `release=<port>@<baud>:<wire ids>`, naming the fields the running documents
bind, so the plugin resumes at once without reading the board again. A board the
plugin feeds counts as found in the configurator's scan without being opened.
The plugin takes `hold` and `release` from loopback only.

**It is the only source.** The Custom Serial Device profile and its export are
retired: every computed field is written once, in the plugin, and the mapping
manifest names the SimHub property or the plugin computation behind each field.

**It ships with the configurator.** CI builds the DLL against a pinned SimHub,
and the Windows installer copies it next to `SimHubWPF.exe`, closing and
restarting SimHub when it holds an older copy.

## Consequences

- Nothing to import and no port to pick. A board behind a USB-UART bridge is
  learned the first time the configurator connects to it.
- The configurator and a running game share a board; while the configurator
  holds it, the board's telemetry passes through the configurator.
- A Custom Serial device left on the same port wins it, and the plugin reports
  the port as busy.
- Feeding a board from SimHub needs the plugin; nothing else writes the line
  format, and a change to a computed field is a change to the plugin alone.
- The plugin is a .NET Framework 4.8 assembly; only CI or a Windows PC with
  SimHub installed can build it.
