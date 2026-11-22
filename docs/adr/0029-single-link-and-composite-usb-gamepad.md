# ADR 0029: One Link Per Board, and a Composite USB Gamepad

Status: Accepted. Narrows the transport picture of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md): a board now carries
exactly one serial link, and on a board with native USB that link shares its USB
device with an HID gamepad. Amended on 2026-11-21: a JC1060P470C build option
lets the one link fall back to the USB-Serial-JTAG port.

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

A JC1060P470C can also lose its native USB connector, as one did. It is then
reachable only through the USB-Serial-JTAG port, and a link that never uses
that port leaves the board with nothing to talk to.

## Decision

**One link.** `Composition` holds a single `Link`, unconditionally. The
`PITRIG_SECOND_TELEMETRY_LINK` option, its log-silencing companion and the
`second-link` build profiles are removed. The P4's link is its native USB CDC
port, the one its `protocol` document already names. Flashing and the ESP
console keep the USB-Serial-JTAG port.

**A fallback for a board without its native connector, as a build option.**
`CONFIG_PITRIG_USB_SERIAL_JTAG_FALLBACK` (the `sdkconfig.defaults.jtag-fallback`
fragment) is off in every released image, so a release keeps the rule above.
With it, the JC1060P470C picks its one port when the link starts: it starts
native USB CDC, and when a host is on the USB-Serial-JTAG port and none
enumerates native USB within two seconds, it stops TinyUSB and starts the
`usb_serial_jtag` transport instead. With no host on the USB-Serial-JTAG port it
never waits. The two transports share one storage slot, because the P4 has
almost no internal RAM to spare, the option moves the ring buffer's ISR
functions to flash for the same reason, and the choice holds until the next
restart. On that port ESP logs go quiet at the end of startup, as on a UART
board. SimHub's Arduino scan opens a free port with DTR and RTS raised, which
leaves the board waiting in the ROM download mode; the controller's bit that
refuses a chip reset from the serial channel, which the build sets, does not stop
it. So the plugin keeps the scan off every port it knows as a Pitrig board — one
it feeds, one the configurator has claimed, one it remembers — through the
`CanBeScanned` event of SimHub's `ComportScanner`, the hook SimHub's own plugins
use, and the scan never opens such a port. Without the plugin the configurator
only narrows the gap: after a restart it opens a port that stays listed at once
and holds it until the board answers. An update goes over OTA, or esptool runs
with `--before no-reset` on a board put into download mode by hand.

**A composite USB device.** On a board with native USB — T-Display-S3,
JC1060P470C and the ESP32-S3-DevKitC-1 — the `usb_cdc` driver's descriptor gains
a third interface: an HID
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

**The serial-number string is the board's own.** `start()` reads the eFuse base
MAC and writes it into the descriptor as twelve hex digits before TinyUSB is
installed, replacing the build-time constant every Pitrig board used to share.
Two boards on one PC are now two devices to the host rather than one seen
twice.

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
- A P4 on the fallback has no gamepad, and a native cable plugged in later is
  used only after a restart. The configurator reaches it through a port picked
  by hand, the SimHub plugin once the configurator has handed it back, and an
  update must carry the option, or the board loses its link until it is flashed
  by cable.
- The gamepad costs about 1.6 KB of flash on the boards that carry it.
