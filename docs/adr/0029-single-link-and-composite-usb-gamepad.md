# ADR 0029: One Link Per Board, and a Composite USB Gamepad

Status: Accepted. Narrows the transport picture of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md): a board now carries
exactly one serial link, and on a board with native USB that link shares its USB
device with an HID gamepad.

## Context

The ESP32-P4 build could attach a second serial link on the USB-Serial-JTAG
port, carrying telemetry, `@PR:` control and asset upload alongside the native
USB CDC port. It was a development aid, and it cost more than it returned: two
links meant `kMaximumLinks` sized the boot arena and the `Application` struct
for a case only one build used, an upload had to arbitrate between links, and
the configuration contract had no way to describe the thing at all.

Separately, a sim-racing dashboard wants to be a gamepad — buttons and encoders
on the wheel deck should reach the sim without a second device.

The obvious reading, "keep the JTAG port and make it the gamepad", is not
buildable. The USB-Serial-JTAG controller is a fixed-function peripheral: its
driver API is seven byte-pipe calls, and the device it presents (CDC-ACM plus a
JTAG vendor interface) is fixed in the chip. There is no descriptor to extend.
An HID interface requires TinyUSB, which runs on the USB-OTG peripheral — the
other port, the one the CDC transport already drives.

## Decision

**One link.** `Composition::kMaximumLinks` is 1, unconditionally. The
`PITRIG_SECOND_TELEMETRY_LINK` option, its log-silencing companion, the
`usb_serial_jtag` transport driver and the `second-link` build profiles are
removed. The P4's link is its native USB CDC port, the one its `protocol`
document already names. Flashing and the ESP console keep the USB-Serial-JTAG
port; the application does not touch it.

**A composite USB device.** On a board with native USB — T-Display-S3 and
JC1060P470C — the `usb_cdc` driver's descriptor gains a third interface: an HID
gamepad with the standard TinyUSB report layout, 32 buttons, six 8-bit axes and
a hat, on its own interrupt endpoint. `usb_gamepad.hpp` is the whole API:
`available()`, `ready()`, `send(Report)`. The Guition ESP32-4848S040 reaches its
host through a CH340 bridge rather than native USB, so it gets none of this and
its image is unchanged.

The switch is `CONFIG_TINYUSB_HID_COUNT` in the board defaults, which is what
TinyUSB already derives `CFG_TUD_HID` from; Pitrig adds no option of its own.
The descriptor asserts its own length at compile time, because a configuration
descriptor whose declared length disagrees with its bytes fails enumeration on
the host and nowhere earlier.

## Consequences

- A host sees one Pitrig device on one cable: a COM port for SimHub telemetry
  and a gamepad, at the same time.
- Nothing feeds the gamepad yet. `usb_gamepad::send()` has no caller — Pitrig
  has no button or encoder input, only a touch digitizer. Wiring an input source
  to it is a separate change.
- The boot arena and `Application` no longer carry a second link's buffers.
- A P4 board can no longer be talked to over its JTAG port while SimHub streams
  on the CDC port. That was the development convenience the second link bought,
  and it is gone.
- The gamepad costs about 1.6 KB of flash on the boards that carry it.
