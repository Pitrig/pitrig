# ADR 0005: Telemetry Ingestion Boundaries

## Context

SimCore needs to receive telemetry from SimHub over native USB CDC now while
remaining independent from both the telemetry protocol and transport. Future
builds may use a Companion protocol and UDP transport. Modules need a coherent
read-only view of the latest telemetry without owning protocol state.

## Decision

The application core owns and composes the transport, protocol,
`TelemetryProvider`, telemetry state service, and Event Bus.

Transports deliver raw data and do not know telemetry semantics. Protocols
decode raw data into partial `TelemetryUpdate` values and do not know the
transport, state service, or Event Bus. `TelemetryProvider` accepts only
`TelemetryUpdate`, commits it through the telemetry state service, and publishes
a `TelemetryUpdated` notification after a successful state change.
Partial updates may explicitly invalidate fields when a source reports that a
previously available value is no longer available.

The telemetry state service is the only owner of mutable canonical telemetry
state. Modules consume update notifications and obtain coherent immutable
snapshots through its read-only interface.

## Consequences

- USB CDC can later be replaced by UDP without changing protocols or modules.
- SimHub can later be replaced by a Companion protocol without changing
  transports, the provider, state service, or modules.
- The provider does not control transport or protocol lifetime.
- Snapshot storage and synchronization can change without changing modules.
- The Event Bus carries telemetry notification metadata but does not interpret
  telemetry fields.
