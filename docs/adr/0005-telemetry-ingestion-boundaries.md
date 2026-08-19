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
name, value type, and runtime slot. The checked-in
`telemetry/telemetry_catalog.json` manifest is the source of truth for this
bounded catalog. Generated firmware, SimHub protocol, checked-in complete
SimHub import profile, configurator profile data, and documentation artifacts
must agree with that manifest. The catalog contains 227 fields and reserves at
most 256 runtime slots. Generic SimHub property mappings live in the separate
source-specific `telemetry/simhub_generic_mappings.json` manifest.

Resolving a name returns a handle containing the slot and type. Names are
resolved only during startup; handles remain valid for the firmware lifetime
and are never persisted. Supported value types are bounded source text,
unsigned and signed 32-bit integers, 32-bit floating point, and boolean.

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
the handles they own instead of copying a complete global snapshot. A slot is a
seqlock: reads — every widget, every render pass — take no lock and never wait
for a writer; writers, the transport tasks, serialise among themselves and
bump the slot's sequence around each change, so a reader that raced a change
simply copies again.

Modules receive typed handles from startup composition. Widget binding resolves
configured canonical names to handles before creating LVGL objects. Widgets
store handles and never know source identifiers, SimHub, or canonical names.

## Consequences

- Transports and protocols remain replaceable independently.
- Adding a new source requires identifier-to-canonical-handle bindings, not
  changes to widgets or domain modules.
- Name lookup, binding validation, and type validation happen during startup.
- Update and rendering paths use fixed storage without runtime allocation.
- The field catalog can grow only within its explicit static limit; changing
  the limit requires an intentional RAM-budget review.
- Catalog edits are generated and validated with
  `python3 tools/generate_telemetry_catalog.py --check`.
- Events are not limited by a 32-bit field mask.
- Generic widgets can retain bounded source text or apply a compatible typed
  transform while modules consume numeric canonical values.
- Multi-field coherent reads would require an explicit read transaction if a
  future module needs them; the current modules consume one handle each.
