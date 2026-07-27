# ADR 0005: Telemetry Ingestion Boundaries

## Context

SimCore needs to receive telemetry from SimHub over a board-appropriate serial
transport now while
remaining independent from both the telemetry protocol and transport. Future
builds may use a Companion protocol and UDP transport. Modules need a coherent
read-only view of the latest telemetry without owning protocol state.

## Decision

The application core coordinates the lifecycle of the configured transport,
protocol, `TelemetryProvider`, telemetry state service, and Event Bus. Concrete
transport instances are resolved outside the core by the platform registry.

Transports deliver raw data and do not know telemetry semantics. Protocols
decode raw data into partial `TelemetryUpdate` values and do not know the
transport, state service, or Event Bus. `TelemetryProvider` accepts only
`TelemetryUpdate`, commits it through the telemetry state service, and publishes
a `TelemetryUpdated` notification after a successful state change.
Transports may expose generic receive-path diagnostics, such as byte counts,
queue depth, overflow counts, and handler latency. Diagnostics contain no
protocol or telemetry-field semantics and are safe to consume by optional
platform debugging UI.
Partial updates may explicitly invalidate fields when a source reports that a
previously available value is no longer available.

The telemetry state service is the only owner of mutable canonical telemetry
state. Modules consume update notifications and obtain coherent immutable
snapshots through its read-only interface.

## Consequences

- USB CDC can later be replaced by UDP without changing protocols or modules.
- The configured board selects its default transport: native USB CDC where the
  native USB pins are available, or UART through an onboard USB-to-UART bridge.
- UART receive failures and scheduling delays can be inspected without writing
  diagnostic text into the same UART stream used for telemetry.
- SimHub can later be replaced by a Companion protocol without changing
  transports, the provider, state service, or modules.
- The provider does not control transport or protocol lifetime.
- Snapshot storage and synchronization can change without changing modules.
- The Event Bus carries telemetry notification metadata but does not interpret
  telemetry fields.
