# ADR 0006: SimHub Custom Serial Line Protocol

## Context

SimCore receives both module inputs and presentation-ready telemetry over a
board-selected serial transport. Generic text widgets must show the source
value exactly, while Lap Timer and Delta Time still require numeric
milliseconds.

## Decision

Use a newline-delimited ASCII-identifier protocol. Each line contains a one- or
two-character identifier, a semicolon, and a bounded UTF-8 value.

Identifiers are `R`, `S`, `G`, `L`, `B`, `D`, `P`, `T`, `A`, `BB`, `F`, `FC`,
and `FL`.

Resolve every identifier to a protocol-neutral telemetry handle once when the
protocol is constructed. Store the exact value string for every recognized
field. An empty value invalidates that handle. Additionally decode `L` as
unsigned integer milliseconds and `D` as signed integer milliseconds according
to registry metadata. Reject a non-empty `L` or `D` line when its numeric value
is invalid. Do not numerically interpret or reformat the other fields.

Keep parser storage fixed. A telemetry value has 48 bytes including its null
terminator, and a complete line has a 63-byte bound.

## Consequences

- SimHub controls units, precision, prefixes, suffixes, and presentation text.
- Every text-widget instance renders the same canonical source string.
- Lap Timer and Delta Time retain numeric behavior without coupling widgets to
  protocol parsing.
- Parsing and state updates use fixed storage and no runtime allocation.
- SimHub identifiers do not escape the protocol implementation.
- Empty, malformed, unknown, and overlong lines cannot corrupt later frames.
