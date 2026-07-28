# ADR 0006: SimHub Custom Serial Line Protocol

## Context

SimCore needs a minimal first telemetry source using SimHub Custom Serial over
the serial transport selected by board configuration. Some boards expose native
USB CDC, while others expose UART through an onboard USB-to-UART bridge. The
ingestion architecture must remain independent of SimHub so that a future
Companion protocol or another transport can replace it.

## Decision

The initial SimHub protocol is an ASCII line protocol. Each newline-terminated
line contains a one- or two-character field identifier, a semicolon, and one
decimal value:
`R` for RPM, `S` for speed in km/h, `G` for gear, `L` for current lap time in
milliseconds, `B` for best lap time in milliseconds, and `D` for signed lap
delta in milliseconds. `P` carries estimated lap time in milliseconds. `T`
carries the traction-control level, `A` carries the ABS level, and `BB` carries
front brake bias as a percentage with at most one fractional digit. A negative
delta means faster and a positive delta means slower. Empty `D`, `P`, `T`, `A`,
or `BB` values explicitly mark the corresponding field as unavailable. `F`
carries fuel remaining in liters, `FC` carries average fuel consumption in
liters per lap, and `FL` carries the estimated remaining fuel laps. Fuel values
are non-negative decimals with at most one fractional digit; an empty fuel
value explicitly marks that field as unavailable.

The composite race dashboard extends the same line protocol with `LL` for the
last completed lap, `ST` for session seconds, `SP` for position and participant
count, `SL` for completed and total laps, `AT` and `RT` for air and track
temperature in tenths of a degree Celsius, `CT` for traction-control cut, and
`EM` for engine map. `X1` through `X4` carry front-left, front-right, rear-left,
and rear-right tire pressure in hundredths of a bar plus surface and inner
temperatures in tenths of a degree, as three comma-separated integers.

`SimHubProtocol` incrementally decodes arbitrary transport chunks and emits one
partial `TelemetryUpdate` per valid line. It owns only bounded parser state and
does not know the transport, provider, telemetry state, or Event Bus.

## Consequences

- The first SimHub integration is easy to configure, inspect, and troubleshoot.
- Partial field rates can be configured independently in SimHub.
- Parsing uses fixed storage and performs no dynamic allocation.
- Malformed, overlong, and unknown lines are ignored without affecting later
  newline-delimited messages.
- Telemetry fields that support an explicit unavailable value can clear their
  validity without exposing protocol-specific sentinel values to modules.
- A future binary or Companion protocol can implement the same protocol
  interface without changing the rest of the telemetry pipeline.
