# ADR 0009: Persistent Runtime Configuration

Status: Accepted; the document shape it introduced is superseded by ADR 0013,
its reboot-only application rule by ADR 0016, and its single-document
two-slot storage by ADR 0024 — which stores one record per configuration
document and drops the alternating pair, NVS already leaving the previous blob
readable through a torn write. What remains in force is the record format
itself, the storage partition, the external-RAM arena, and the fact that the
payload is bounded — the bound itself lives in the schema rather than here, and
is now one bound per document. Font references are defined by ADR 0010.

## Context

SimCore needs configuration that survives restart, can be managed by the
desktop configurator, and cannot make a device permanently unbootable after an
interrupted write. Runtime storage must remain bounded and isolated from
unrelated NVS users.

The original format stored a complete expanded snapshot, and a sparse file was
expanded through a board profile before it was stored — so a board-only file
silently enabled modules and widgets. That behavior is incompatible with a
configurator-first workflow where omitted components must remain absent and a
freshly flashed device must show an empty screen.

## Decision

Keep the immutable hardware board identity in the firmware build. The factory
user configuration contains only the matching board identifier. It enables no
user-configured hardware devices, modules, or widgets. Hardware declared as
built into the board remains enabled according to the immutable board-registry
mapping; in particular, a board-provided display is initialized by default.

Persist a bounded sparse JSON document:

- the public authoring document is also the public transport payload;
- property names and nesting are defined by the JSON contract (ADR 0013);
- the board identifier is mandatory;
- the configurable hardware-device list is optional and may be empty;
- optional sections and fields remain absent when omitted;
- unknown or duplicate properties, malformed JSON, excessive payloads, and
  invalid values are rejected by firmware.

The line-oriented control protocol transfers compact JSON directly, without a
secondary TLV or hexadecimal representation. Missing properties remain
missing instead of being expanded through a board profile.

Keep the desktop configurator's sparse authoring draft independent from a
device session. A disconnect does not clear it, and connecting a board
does not replace an existing local draft. The draft's `board` selects the
configurator's immutable local board profile for offline preview and editing.
Loading from the connected board is an explicit replacement operation. Saving
to a board requires matching board identities.

Allow the configurator to create a board-only local draft and import or export
the same public JSON through desktop file dialogs. File import checks
the supported board, bounded schema shape, and compact firmware payload limit.
Local files introduce no project-only properties into the device payload.

Persist the exact validated sparse payload through `IConfigurationStorage`.
Keep the existing two-slot `simcore_cfg` NVS strategy: every internal record
contains magic, record and schema versions, payload size, generation, and
CRC32. Write and verify the inactive slot before selecting it. These record
headers and slot mechanics remain private firmware details.

Bound the compact JSON payload at `kMaximumPayloadSize`, which the generated
configuration contract defines. Size the dedicated
`simcore_cfg` NVS partition at 1 MiB (`0x100000`). Two full-size records, the
copy NVS keeps while it rewrites one, and NVS's own page metadata fit in a
quarter of that; the rest is deliberate headroom for storing several
configurations rather than one, which is planned and would otherwise force a
second flash migration. ADR 0022 later cut it to 512 KiB (`0x80000`): ADR 0024
split the stored configuration into three documents totalling 66 KiB rather than
two 64 KiB records, so half the partition buys the same headroom and the other
half was worth more as flash a board can be given assets in. The slots
themselves stay a pair — `StorageSlot{a, b}` is how one record is replaced
atomically, not how profiles are kept.

The partition was 256 KiB at `0x210000` until ADR 0022 rebuilt the table around
two application slots. Growing it moves everything after it, so installing
either change is one full erase: configuration, fonts and images are all
re-uploaded afterwards.

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

A record of an unsupported schema version is not migrated: startup falls back
to the other valid slot or to the board-only factory configuration.

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
  sparse document.
- Connecting or disconnecting hardware cannot silently discard a local draft.
- A local draft for one board cannot be written to a different board.
- Interrupted or corrupt writes retain the existing verified-slot recovery.
- Storage, protocol, and runtime containers remain bounded and deterministic.
- Large configuration workspaces do not consume internal RAM, while normal
  telemetry ingestion remains on the internal-memory hot path.
- Adding or changing public fields requires a documented schema change shared
  by firmware and configurator.
