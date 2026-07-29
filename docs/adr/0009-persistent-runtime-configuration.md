# ADR 0009: Persistent Runtime Configuration

## Context

SimCore needs configuration that survives restart, can be replaced by the CLI
or a future companion, and cannot make a device permanently unbootable after an
interrupted write. Runtime storage must remain bounded and isolated from
unrelated NVS users.

## Decision

Keep immutable factory defaults in the application configuration component.
Select the factory board profile at build time and reject runtime
configurations for another board.

Persist explicit little-endian binary records through
`IConfigurationStorage`. Store two records in the dedicated `simcore_cfg` NVS
partition. Each record contains a magic value, record and schema versions,
payload size, generation, and CRC32. Write and verify the inactive slot before
selecting it.

Start configuration schema versioning at 0 and support schema 0 only. An
unsupported stored record is ignored and startup falls back to another valid
slot or factory defaults.

Schema 0 contains:

- board and transport configuration;
- Lap Timer and Delta Time module configuration;
- one dashboard region;
- Lap Timer and Delta Time widget configuration;
- an ordered bounded array of up to 16 generic text-widget configurations.

Text-widget bindings are stored as bounded canonical telemetry names. Runtime
handles are never persisted because they are valid only for one registry
instance. The maximum binary payload is 2560 bytes. Binding names, text titles,
and unavailable values use fixed null-terminated UTF-8 storage.

Treat sparse JSON as an authoring format and the binary payload as the complete
canonical snapshot. Unknown JSON fields are rejected. Saving a configuration
takes effect after restart.

## Consequences

- Interrupted or corrupt writes fall back safely.
- SimCore recovery cannot erase Wi-Fi credentials or unrelated NVS data.
- Configuration storage, routing, and response buffers have deterministic
  bounds.
- Multiple text-widget instances do not require variable-sized firmware
  containers.
- Unsupported configuration records fall back to factory defaults.
- Adding fields requires an explicit schema change in firmware and CLI.
