# ADR 0024: Separate Configuration Documents

Status: Accepted. Schema 14. Supersedes the single-document wire and storage
model of [ADR 0009](0009-persistent-runtime-configuration.md) and
[ADR 0013](0013-generated-configuration-contract.md); rescopes the replacement
transaction of [ADR 0016](0016-runtime-configuration-ownership.md) and the
control command set of [ADR 0006](0006-simhub-custom-serial-line-protocol.md).

## Context

Until schema 13 the device held exactly one configuration document. Its four
public sections — `board`, `hardware`, `telemetry_transport`, `dashboard` — were
authored as one file, sent as one `@SC:SET:` line, parsed whole into one bounded
`ApplicationConfiguration`, and stored as one NVS blob in one of two alternating
slots. Nothing could be read, written, validated or applied on its own.

The sections do not behave alike, and the single document forced them to.

- Their sizes differ by two orders of magnitude. A dashboard filled to every
  per-type widget cap approaches the 64 KB payload bound; the transport is under
  a hundred bytes and the peripheral section is `[]`. Editing a baud rate wrote
  the whole dashboard to flash.
- Their costs differ. A dashboard replacement can be rebuilt into the running
  LVGL tree; the transport cannot, because the link is selected once at startup.
  With one document every save had to answer `reboot_required=1`, and the
  configurator paired every `SET` with an `APPLY` to work around it.
- Their authors differ. The configurator has had a workspace each — Dashboard,
  Modules, Protocol — over one document that none of them owned, so a page could
  not say whether *its* settings were saved and a dashboard edit lit a modified
  dot on the Protocol page.
- Live apply resent the entire document on every keystroke, because `@SC:APPLY`
  had no finer unit than "all of it".

The two-slot NVS pair was a second question. It was introduced to make a
replacement atomic, but ESP-IDF's NVS already writes a new blob before retiring
the old, so a torn write leaves the previous record readable without it. What
the pair actually bought was a fallback for a record a *new firmware* refuses —
and that record is refused because the schema version moved, which the other
slot would fail on identically.

## Decision

**Three documents.** The contract declares them in
`configuration/configuration_schema.json` under a `documents` block, and the
generator emits them for both readers:

| Document | Carries | Maximum payload | Restart to take effect |
| --- | --- | --- | --- |
| `dashboard` | `board`, `dashboard` | 65536 bytes | no |
| `modules` | `board`, `hardware` | 1024 bytes | no |
| `protocol` | `board`, `telemetry_transport` | 1024 bytes | yes |

The block must partition every serialized root section: a section in two
documents, or in none, is a generator error. `kMaximumPayloadSize` stays the
largest of the three and is what sizes the shared line, record and reply
buffers; each document is held to its own bound.

**`board` travels in every document.** Each one is therefore answerable on its
own for arriving at the wrong hardware, and the existing `board_mismatch`
rejection applies unchanged to all three. It is the flattened
`BoardConfiguration` in each, not a copy of a field that could disagree with
one.

**One record per document, and no slot pair.** NVS keys are the document names.
The 20-byte record header is unchanged — magic, record version, schema version,
payload size, generation, CRC32 — and the generation is per document. The
`active` marker is gone.

**One aggregate in memory.** `ApplicationConfiguration` remains the single root
struct and the single runtime document, because the rules that matter most span
sections: a UART pin the board does not have, a font budget over every widget,
a `lap_timer` modifier that may appear once. A document replaces only the
sections it owns, and the whole aggregate is validated afterwards. This is what
lets the split cost nothing in validation coverage.

**The wire names the document.** `@SC:GET:<document>`,
`@SC:VALIDATE:<document>:<json>`, `@SC:APPLY:<document>:<json>`,
`@SC:SET:<document>:<json>`, `@SC:RESET:<document>`, and `@SC:RESET` for all
three. Names are the contract's own lowercase spellings, as `board=t_display_s3`
already is. `@SC:INFO` reports one field per document —
`<document>=<outcome>:<generation>` — instead of a single `source=` token that
could only ever describe one of three.

**`reboot_required` is per document,** taken from the same schema entry: the
protocol document answers 1, the other two answer 0.

**The file stays whole.** A saved `.json`, a template payload and the editor's
draft are still one aggregate configuration. The file is the project; the three
documents are the transfers. Splitting the file too would have divided the
template envelope, the saved-configuration library and the layout transfer for
nothing an author would recognise.

## Consequences

- Schema 13 → 14, a breaking change. Old records are refused as
  `unsupported_schema` and not migrated, following the precedent of
  [ADR 0021](0021-widget-groups-and-slots.md). The first boot after
  flashing comes up on factory values and the configurator re-saves. The old
  `slot_a` / `slot_b` / `active` keys are simply never read again.
- The compiled factory configuration becomes three documents per board, in
  `BoardDefinition::factory_configuration_json`. This is what lets
  `@SC:GET:<document>` answer with the bytes the board is actually running when
  nothing is stored — the firmware has no serializer to carve a section out of a
  larger payload with. It is also where the Guition ESP32-4848S040's 460800
  baud rate now lives, in its protocol document alone.
- `stage()` copies the active document to scratch before parsing, so the
  sections a replacement does not own survive the promotion swap. The ADR 0016
  ordering — parse into scratch, validate, promote, rebuild — is unchanged, and
  nothing between promotion and rebuild reads the document.
- The `dashboard_only` test in `apply_configuration` is gone. Which document
  arrived *is* the answer: `dashboard` may take the incremental path, `modules`
  recomposes, `protocol` is staged and promoted with nothing rebuilt from it.
- Live apply sends only the documents that changed, which in practice is the
  dashboard. An edit confined to the protocol document sends nothing at all.
- A save writes only the documents that differ from the board, protocol first
  and dashboard last, so a partial failure leaves the cheap writes done and the
  expensive one untouched. Font resolution runs only when the dashboard is among
  them.
- Peripherals get a document before they get a driver. The `hardware` section is
  still rejected while non-empty ([ADR 0011](0011-static-composition-and-module-lifecycle.md)),
  but when the first one lands it costs neither the dashboard's bytes nor its
  restarts.
- This is **not** the root module-enablement section
  [ADR 0003](0003-lap-timer-module-and-value-pipeline.md) decided
  against. The `modules` document carries peripherals; the Lap Timer still
  activates from a `lap_timer` modifier inside a dashboard widget's source, and
  that binding stays inside one document.
- The `simcore_cfg` partition is unchanged by this decision. Three records come
  to 66 KiB, comfortably inside the 512 KiB it holds since ADR 0022.
