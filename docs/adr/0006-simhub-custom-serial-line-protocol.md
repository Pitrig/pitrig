# ADR 0006: SimHub Custom Serial Line Protocol

## Context

SimCore needs a minimal first telemetry source using SimHub Custom Serial over
native USB CDC. The ingestion architecture must remain independent of SimHub so
that a future Companion protocol or another transport can replace it.

## Decision

The initial SimHub protocol is an ASCII line protocol. Each newline-terminated
line contains one field identifier, a semicolon, and one decimal value:
`R` for RPM, `S` for speed in km/h, `G` for gear, `L` for current lap time in
milliseconds, and `B` for best lap time in milliseconds.

`SimHubProtocol` incrementally decodes arbitrary transport chunks and emits one
partial `TelemetryUpdate` per valid line. It owns only bounded parser state and
does not know the transport, provider, telemetry state, or Event Bus.

## Consequences

- The first SimHub integration is easy to configure, inspect, and troubleshoot.
- Partial field rates can be configured independently in SimHub.
- Parsing uses fixed storage and performs no dynamic allocation.
- Malformed, overlong, and unknown lines are ignored without affecting later
  newline-delimited messages.
- A future binary or Companion protocol can implement the same protocol
  interface without changing the rest of the telemetry pipeline.
