# ADR 0009: Persistent Runtime Configuration

## Context

SimCore configuration was compiled into the firmware image. A desktop companion
and the developer CLI need to inspect and replace device configuration without
rebuilding firmware. Configuration must survive restart and must not leave the
device unbootable when power is lost during a write. Telemetry and configuration
currently share the board-selected serial transport.

## Decision

Keep immutable factory defaults in the application configuration component.
Select the fallback board profile at build time so a fresh board starts the
transport and display appropriate for its hardware, while keeping every driver
linked. Treat that build-time board profile as the firmware's immutable hardware
identity. Before resolving drivers or starting modules, load a versioned runtime
configuration through the configuration service.

Persist explicit binary records through `IConfigurationStorage`. The ESP-IDF
adapter stores records in two NVS slots. Each record contains a magic value,
record and schema versions, payload size, monotonically increasing generation,
and CRC32. Write and verify the inactive slot before atomically selecting it.
At boot, use the active valid slot, then the other valid slot, then factory
defaults.

Use an explicit little-endian codec rather than serializing C++ object memory.
Validate a complete candidate before saving it and reject a `board.id` that does
not match the build-time hardware identity with `board_mismatch`. Treat stored
records for another board as invalid during startup. Runtime configuration
remains immutable; a saved configuration takes effect after device restart.
Dashboard widget configuration includes an enable flag so disabled widgets do
not create runtime UI objects. Schema 2 adds these flags while schema 1 remains
readable and maps every existing widget to enabled.

Schema 3 adds the gear widget configuration. Schema 1 and 2 records remain
readable and receive the gear defaults for their board. The gear widget is
enabled only for `guition_esp32_4848s040`; configurations for `t_display_s3`
cannot enable it.

Extend transports with bounded response writes. Route newline-delimited frames
beginning with `@SC:` to the configuration control protocol and route all other
lines to the configured telemetry protocol. The developer CLI converts JSON
files to the same binary schema that a future companion application will use.

## Consequences

- Configuration changes survive restart and firmware startup does not depend on
  a companion application.
- An interrupted or corrupt write falls back to the previous slot or factory
  defaults.
- A configuration for another board cannot be applied, and a mismatched record
  already present in NVS is ignored during startup.
- Wire compatibility is controlled by the schema version and does not depend on
  compiler ABI or struct padding.
- Modules, widgets, drivers, and the core receive one coherent immutable
  configuration snapshot.
- Widget visibility is configuration-driven without dynamically allocating a
  variable-size widget registry.
- The gear widget reuses the canonical telemetry snapshot and remains
  board-limited through validated application composition rather than
  hardware-specific rendering code.
- Configuration and SimHub telemetry can share one serial connection without
  either protocol interpreting the other's messages.
- Changes that affect drivers, transports, modules, or layout require restart.
- Adding fields requires a schema and codec change, plus corresponding CLI
  support and migration or fallback behavior.
