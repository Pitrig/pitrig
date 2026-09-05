# ADR 0006: SimHub Custom Serial Line Protocol

Status: Accepted; the telemetry line format is in force unchanged. The `@PR:`
configuration commands are amended by ADR 0024, which gives `GET`, `VALIDATE`,
`APPLY`, `SET` and `RESET` a document name and replaces `INFO`'s single
`source=`/`generation=` pair with one field per document. Narrowed by
[ADR 0029](0029-single-link-and-composite-usb-gamepad.md): a board carries
exactly one serial link, and on a board with native USB that link shares its
USB device with an HID gamepad.

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

Generate both an importable complete `Pitrig-telemetry.shsds` Custom Serial
Device profile and configurator profile data from the canonical catalog and a
separate generic SimHub mapping manifest. The checked-in profile enables every
catalog field. The configurator can export either that complete set or only
the dependencies of its current dashboard draft. Dashboard dependencies are
every binding the document reads, whether or not a widget shows it: the sources
a text widget composes, the source a mapped widget consumes, a
`condition_source`, an image's `sprite_frame_source`, a slot page's trigger
source, and `session.lap.current_time` for a Lap Timer modifier. The walk is
driven by the generated widget-type list, so a type added to the contract
cannot be silently left out of the profile.

Both export paths use the catalog rate classes: 60 Hz for fast, 20 Hz for
normal, 5 Hz for slow, and changes-only for stable values. The complete profile
uses 921600 baud to provide headroom for the complete stream. A configurator
export uses an explicit draft UART baud rate when present and otherwise uses
921600. Game-specific property mappings remain outside the repository.

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
  firmware in a source-adapter manifest.
- Dashboard-only profiles avoid transmitting catalog fields that have no
  configured consumer while retaining hidden module inputs.
- The checked-in complete profile remains available without running the
  configurator.
- Importing the generated profile still requires selecting the device's serial
  port; unsupported properties are transmitted as unavailable values.
- Empty, malformed, unknown, and overlong lines cannot corrupt later frames.
