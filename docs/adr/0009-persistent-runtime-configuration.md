# ADR 0009: Persistent Runtime Configuration

Status: Accepted; the schema 2 document shape is superseded by ADR 0013 and
the reboot-only application rule by ADR 0016. The two-slot NVS record
strategy and the fact that the payload is bounded remain in force; the bound
itself lives in the schema rather than here.
Implementation status: the desktop configurator now supports the complete
control round trip, and the legacy schema 0 CLI and inheritance profiles have
been removed. Schema 2 font references are defined by ADR 0010.

## Context

SimCore needs configuration that survives restart, can be managed by the
desktop configurator, and cannot make a device permanently unbootable after an
interrupted write. Runtime storage must remain bounded and isolated from
unrelated NVS users.

The original schema stored a complete expanded snapshot. Sparse JSON was
expanded through a board profile by the CLI, so a board-only file silently
enabled modules, regions, and widgets. That behavior is incompatible with a
configurator-first workflow where omitted components must remain absent and a
freshly flashed device must show an empty screen.

## Decision

Keep the immutable hardware board identity in the firmware build. The factory
user configuration contains only the matching board identifier. It enables no
user-configured hardware devices, modules, or widgets. Hardware declared as
built into the board remains enabled according to the immutable board-registry
mapping; in particular, a board-provided display is initialized by default.

Replace the legacy schemas with schema 2. Schema 2 is a bounded sparse JSON
document:

- the public authoring document is also the public transport payload;
- property names and nesting are defined by the schema 2 JSON contract;
- the board identifier is mandatory;
- the configurable hardware-device list is optional and may be empty;
- optional sections and fields remain absent when omitted;
- unknown or duplicate properties, malformed JSON, excessive payloads, and
  invalid values are rejected by firmware.

The line-oriented control protocol transfers compact JSON directly, without a
secondary TLV or hexadecimal representation. Missing properties remain
missing instead of being expanded through a board profile.

Keep the desktop configurator's sparse schema 2 authoring draft independent
from a device session. A disconnect does not clear it, and connecting a board
does not replace an existing local draft. The draft's `board` selects the
configurator's immutable local board profile for offline preview and editing.
Loading from the connected board is an explicit replacement operation. Saving
to a board requires matching board identities.

Allow the configurator to create a board-only local draft and import or export
the same public schema 2 JSON through desktop file dialogs. File import checks
the supported board, bounded schema shape, and compact firmware payload limit.
Local files introduce no project-only properties into the device payload.

Persist the exact validated sparse payload through `IConfigurationStorage`.
Keep the existing two-slot `simcore_cfg` NVS strategy: every internal record
contains magic, record and schema versions, payload size, generation, and
CRC32. Write and verify the inactive slot before selecting it. These record
headers and slot mechanics remain private firmware details.

Bound the compact JSON payload at `kMaximumPayloadSize`, which the generated
configuration contract defines — 65536 bytes as of schema 10. Size the dedicated
`simcore_cfg` NVS partition at 64 KiB so both rollback records and NVS metadata
fit within the partition. The partition keeps its original start offset; the
following font-assets partition moves and therefore requires font assets to be
uploaded again after installing the updated partition table.

Parse the sparse JSON into a concrete bounded runtime configuration during
startup and before accepting a replacement. JSON parsing is confined to the
configuration control/startup path; periodic runtime paths continue to use
fixed-size typed structures. Missing properties of a present component use
defaults owned by that component. A missing user-configured hardware device,
module, or widget is not created. Board-provided hardware is composed from the
immutable board-registry mapping independently of this optional list. A missing
telemetry transport uses the immutable board default.

Place the firmware-lifetime payload, NVS record, asynchronous control, and
control-line workspaces in one platform-owned external-RAM allocation. Allocate
that bounded arena once during startup and pass non-owning spans into the
platform-independent services. Keep the bounded telemetry line buffer in
internal RAM; the communication router switches to the external control-line
workspace only after recognizing the `@SC:` prefix.

Schema 0 and schema 1 records are not migrated. They are treated as unsupported
and startup falls back to a valid schema 2 slot or the board-only factory
configuration. Saving still takes effect after restart.

The schema 0 configuration CLI was not extended to encode schema 2. It was
removed after the configurator implemented `INFO`, `GET`, `VALIDATE`, `SET`,
`RESET`, and `REBOOT`, together with its inheritance profiles.

## Consequences

- A clean flash or reset initializes the board-provided display with no
  configured dashboard content and no additional configured hardware devices.
- Board compatibility remains enforceable even when every optional section is
  absent.
- Hardware composition remains configuration-driven for supported peripherals;
  an empty hardware list is valid and does not disable immutable board
  capabilities.
- Omitted components do not reappear through hidden profile inheritance.
- Public JSON and private NVS record framing remain separate contracts.
- Offline authoring, JSON file exchange, and device persistence use the same
  sparse schema 2 document.
- Connecting or disconnecting hardware cannot silently discard a local draft.
- A local draft for one board cannot be written to a different board.
- Interrupted or corrupt writes retain the existing verified-slot recovery.
- Storage, protocol, and runtime containers remain bounded and deterministic.
- Large configuration workspaces do not consume internal RAM, while normal
  telemetry ingestion remains on the internal-memory hot path.
- Schema 0 and schema 1 configurations are intentionally discarded after the
  upgrade.
- Adding or changing public fields requires a documented schema change shared
  by firmware and configurator.
