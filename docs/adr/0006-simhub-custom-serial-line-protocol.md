# ADR 0006: SimHub Custom Serial Line Protocol

Status: Accepted; the telemetry line format is in force unchanged. The `@PR:`
configuration commands are amended by ADR 0024, which gives `GET`, `VALIDATE`,
`APPLY`, `SET` and `RESET` a document name and replaces `INFO`'s single
`source=`/`generation=` pair with one field per document. Narrowed by
[ADR 0029](0029-single-link-and-composite-usb-gamepad.md): a board carries
exactly one serial link, and on a board with native USB that link shares its
USB device with an HID gamepad. The Custom Serial Device profile it generated
is retired by [ADR 0035](0035-simhub-plugin-feeds-the-board.md): the SimHub
plugin is the only source that writes these lines.

## Context

Pitrig receives both module inputs and telemetry over a board-selected serial
transport. Generic text widgets may show the source value exactly or apply a
typed presentation transform. Lap times — current, best, estimated and the
signed delta between them — therefore require numeric milliseconds.

## Decision

Use a newline-delimited ASCII-identifier protocol. Each line contains a one- or
two-character identifier, a semicolon, and a bounded UTF-8 value.

The generated telemetry catalog assigns one- or two-character ASCII
alphanumeric identifiers. Existing identifiers `R`, `S`, `G`, `L`, `B`, `D`,
`P`, `T`, `A`, `BB`, `F`, `FC`, and `FL` remain stable for compatibility.

Resolve every identifier to a protocol-neutral telemetry handle once when the
protocol is constructed. Store the exact value string for every recognized
field. An empty value invalidates that handle. Additionally decode values as
unsigned integer, signed integer, float, or boolean according to registry
metadata. Reject a non-empty typed line when its value is invalid.

A float is decimal only: an optional sign, digits with an optional `.` and
fraction, at least one digit between the two, and an optional `e`/`E` exponent
with its own optional sign and at least one digit. The whole value must be
consumed and the result finite, and it is at most 31 characters. `0x` forms,
`inf` and `nan` are rejected — the grammar is checked before the conversion, so
whatever the C library would otherwise accept does not reach the slot.

The SimHub plugin of ADR 0035 writes the lines, each field at its catalog rate
class: 60 Hz for fast, 20 Hz for normal, 5 Hz for slow, and changes-only for
stable values. A generic SimHub mapping manifest beside the canonical catalog
names the SimHub property, the game's raw property, or the plugin computation
behind each field. A board's UART runs at 921600 baud unless its `protocol`
document says otherwise.

Keep parser storage fixed. A telemetry value has 64 bytes including its null
terminator, and a complete line has a 127-byte bound
(`telemetry::kMaximumTelemetryLineLength`). The link's router assembles lines
against that bound and the protocol decodes one complete line at a time, so
the bound and the assembly state exist once per link rather than once per
layer.

## Consequences

- SimHub controls source text for text-valued fields; firmware configuration
  controls typed formatting, prefixes, and suffixes.
- Text-widget instances can independently format the same canonical value.
- Lap timing retains numeric behavior without coupling widgets to protocol
  parsing.
- Parsing and state updates use fixed storage and no runtime allocation.
- SimHub identifiers do not escape the protocol implementation.
- Generic SimHub property names remain isolated from the canonical catalog and
  firmware in a source-adapter manifest; unsupported properties are transmitted
  as unavailable values.
- Empty, malformed, unknown, and overlong lines cannot corrupt later frames.
