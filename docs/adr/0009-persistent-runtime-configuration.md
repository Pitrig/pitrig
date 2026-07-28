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
adapter stores records in two NVS slots inside a dedicated `simcore_cfg` NVS
partition. Recovery may erase only that partition and must never erase the
default NVS partition used by unrelated services. Each record contains a magic
value, record and schema versions, payload size, monotonically increasing
generation, and CRC32. Write and verify the inactive slot before atomically
selecting it. At boot, use the active valid slot, then the other valid slot,
then factory defaults.

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

Schema 4 adds the speed widget configuration. Earlier records remain readable
and receive the board defaults: enabled on `guition_esp32_4848s040` and
disabled on `t_display_s3`.

Schema 5 adds independent traction-control, ABS, and brake-bias widget
configuration. The three cards share one fixed implementation while retaining
separate enable, placement, font, padding, border, and color settings. The
Guition factory profile enables the three cards and moves the gear card to the
top-right corner so their bounds do not overlap. The T-Display profile keeps
them disabled. Earlier records remain readable and receive these widgets as
disabled.

Schema 6 adds an independent signed vertical label offset to each driving-aid
card. Schema 5 records remain readable and use a zero offset.

Schema 7 adds a numeric RPM widget with independent enable, font, placement,
and text-color settings. The Guition factory profile enables it above the speed
widget, while the T-Display profile keeps it disabled. Earlier records remain
readable and receive the RPM widget as disabled.

Schema 8 adds independent fuel-level, average-consumption, and remaining-laps
widgets. The Guition factory profile enables the three widgets around the
bottom-center speed value, while the T-Display profile keeps them disabled.
Earlier records remain readable and receive all three fuel widgets as disabled.
Increase the bounded configuration payload capacity from 512 to 768 bytes so
the complete schema 8 snapshot fits without variable-sized runtime
configuration.

Schema 9 removes the fuel-pump icon and its color setting. Schema 8 records
remain readable; their former icon-color value is consumed and discarded
during migration.

Extend transports with bounded response writes. Route newline-delimited frames
beginning with `@SC:` to the configuration control protocol and route all other
lines to the configured telemetry protocol. The developer CLI converts JSON
files to the same binary schema that a future companion application will use.
Treat JSON as a sparse authoring format and the binary payload as the complete
canonical snapshot. Missing general JSON fields inherit the selected board
profile. A `dashboard.widgets` object is presence-driven: only listed widgets
are enabled, while missing fields inside a listed widget inherit board defaults.
Reject unknown fields instead of silently ignoring spelling errors.

## Consequences

- Configuration changes survive restart and firmware startup does not depend on
  a companion application.
- Corrupt SimCore configuration recovery cannot erase Wi-Fi credentials or
  data owned by another default-NVS namespace.
- An interrupted or corrupt write falls back to the previous slot or factory
  defaults.
- A configuration for another board cannot be applied, and a mismatched record
  already present in NVS is ignored during startup.
- Wire compatibility is controlled by the schema version and does not depend on
  compiler ABI or struct padding.
- Modules, widgets, drivers, and the core receive one coherent immutable
  configuration snapshot.
- Human-authored files remain short while firmware parsing stays bounded,
  allocation-free, and independent from JSON.
- Widget visibility is configuration-driven without dynamically allocating a
  variable-size widget registry.
- Modules used only by omitted dashboard widgets are not started and do not
  subscribe to telemetry events.
- The gear widget reuses the canonical telemetry snapshot and remains
  board-limited through validated application composition rather than
  hardware-specific rendering code.
- The speed widget reuses the canonical telemetry snapshot and renders only the
  numeric speed value; it owns no telemetry state or processing.
- The RPM widget reuses the canonical telemetry snapshot and renders only the
  numeric RPM value; it owns no telemetry state or processing.
- Fuel widgets reuse canonical fuel telemetry supplied by the selected
  protocol. They do not calculate consumption or detect completed laps in UI
  code.
- The three driving-aid widgets reuse the canonical telemetry snapshot and one
  presentation implementation without adding feature modules or duplicated
  render logic.
- Configuration and SimHub telemetry can share one serial connection without
  either protocol interpreting the other's messages.
- Changes that affect drivers, transports, modules, or layout require restart.
- Adding fields requires a schema and codec change, plus corresponding CLI
  support and migration or fallback behavior.
