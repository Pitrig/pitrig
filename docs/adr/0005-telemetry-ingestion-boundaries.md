# ADR 0005: Telemetry Ingestion Boundaries

## Context

SimCore needs to receive telemetry from SimHub over a board-appropriate
transport while remaining independent from both that protocol and transport.
Future sources may use a Companion protocol and UDP. Widgets and modules need
stable, typed access without depending on SimHub identifiers or performing
field-name searches in periodic paths.

## Decision

Use the following ingestion and consumption boundaries:

```text
Transport -> Protocol -> TelemetryProvider -> TelemetryState
                        TelemetryRegistry
                                |
                     startup binding to handles
                                |
                     Modules and platform widgets
```

The immutable telemetry registry owns canonical field metadata: protocol-neutral
name, value type, and runtime slot. Resolving a name returns a handle containing
the slot and type. Names are resolved only during startup; handles remain valid
for the firmware lifetime and are never persisted.

Transports deliver raw bytes and know no telemetry semantics. A protocol binds
its source identifiers to canonical handles during construction, then decodes
raw data into one-field typed `TelemetryUpdate` values. It does not know the
state service or Event Bus.

`TelemetryProvider` commits updates through the telemetry state service and
publishes a `TelemetryUpdated` event containing the changed handle and
revision. An unavailable update invalidates only that slot.

The state service is the only owner of mutable canonical values. Storage is a
fixed array indexed by handle. Each slot retains availability, typed value,
bounded source text, revision, and last-change timestamp. Consumers read only
the handles they own instead of copying a complete global snapshot.

Modules receive typed handles from startup composition. Widget binding resolves
configured canonical names to handles before creating LVGL objects. Widgets
store handles and never know source identifiers, SimHub, or canonical names.

## Consequences

- Transports and protocols remain replaceable independently.
- Adding a new source requires identifier-to-canonical-handle bindings, not
  changes to widgets or domain modules.
- Name lookup, binding validation, and type validation happen during startup.
- Update and rendering paths use fixed storage without runtime allocation.
- Events are not limited by a 32-bit field mask.
- Generic widgets can retain source formatting while modules consume numeric
  canonical values.
- Multi-field coherent reads would require an explicit read transaction if a
  future module needs them; the current modules consume one handle each.
