# Control protocol

The `@PR:` line protocol a host uses to read a board, write its three
configuration documents and start an upload, over the serial link the
`protocol` document selects. The documents themselves, their presence rules and
the widget semantics are in [device-configuration.md](device-configuration.md);
the property table is the generated [configuration-schema.md](configuration-schema.md),
and the upload frames are in [font-assets.md](font-assets.md).
## Device information

`INFO` reports immutable device metadata and configuration storage status:

```text
@PR:INFO
@PR:OK:INFO:board=t_display_s3,firmware=<version>,schema=24,storage=1,safe_mode=0,boot_failures=0,reset_reason=power_on,last_phase=none,dashboard=valid:3,modules=absent:0,protocol=valid:1
```

Fields:

- `board` is the immutable factory board identifier;
- `firmware` comes from the ESP-IDF application description;
- `schema` is the supported public configuration schema;
- `storage` is `1` when persistent configuration storage is available;
- `safe_mode` is `1` when the board came up on the recovery surface: the link,
  this control protocol and firmware upload, and nothing else — no display, no
  dashboard, no modules, no font or image upload, and no telemetry decode. See
  [ADR 0025](adr/0025-startup-order-and-safe-mode.md);
- `boot_failures` counts the crashes and watchdog resets since the last power-on
  or the last document written or erased. Three of them in a row is what sets
  `safe_mode`, and a successful `SET` or `RESET` is what clears it;
- `reset_reason` is why this boot happened: `power_on`, `software`, `panic`,
  `task_watchdog`, `brownout` or `other`;
- `last_phase` is how far the **previous** boot got: `none`, `configuration`,
  `link`, `display`, `assets`, `composition` or `complete`. On a board that
  keeps crashing this is the field that says what is crashing it;
- one field per configuration document, named after it and spelled
  `<outcome>:<generation>`. The outcome is `absent`, `malformed_record`,
  `unsupported_schema`, `corrupt_payload`, `rejected` or `valid`; the generation
  is the stored record's, or `0` when there is none. `absent` is not a fault —
  it is a board running that document's factory value.

The configurator must resolve display information from the `board` field and
its local supported-board registry, present it as read-only device information,
and must not infer physical hardware from a saved user configuration. An
unknown board is incompatible until the configurator adds an explicit board
profile. Boards without a built-in display require a separately documented
profile before they are supported.


`INFO` and `GET` describe what the device has stored, not what it is running. A
successful `SET` or `RESET` moves both at once — the document's outcome and
generation in `INFO`, and the payload `GET` answers with — while the composition
keeps rendering what it was given until a reboot or an `APPLY`. `APPLY` is the
other way round: it replaces what the composition renders and leaves the stored
record and its generation untouched.


## Runtime diagnostics

`DIAG` reports what the running device costs rather than what it holds: live
memory figures and the frame sampler's last second, on a window that slides
twenty times a second — a caller polling faster than that second is answered
with figures that moved since its previous call, not with one frozen block per
second. It is the same measurement the debug overlay draws, answered on the link
instead of on the panel, so a board whose limits are being measured can be read
exactly and from a script rather than off its own screen.

It is a **debug-build** command. Firmware built without `CONFIG_PITRIG_DEBUG`
carries no sampler, so it answers `@PR:ERR:unsupported`; see
[runtime-performance.md](runtime-performance.md) for the build.

```text
@PR:DIAG
@PR:OK:DIAG:internal_total=393216,internal_free=180224,internal_min=172032,internal_largest=131072,psram_total=8388608,psram_free=7340032,psram_min=7208960,psram_largest=4194304,fps=59.9,cpu0=12.4,cpu1=31.0,render_us=3120,flush_us=1980,sync_us=410,frame_max_us=17600,work_max_us=6200,gap_max_us=9100,inval_px=6059,inval_areas=3,drawn_areas=1,lat_us=7100,lat_max_us=12900,lat_n=58,stack_lvgl=3200,stack_transport=2100,stack_control=1800,stack_upload=2400,stack_sampler=1500,uptime_ms=48213
```

Fields:

- `internal_*` and `psram_*` are the total, current free, lowest free since
  boot, and largest free block of each heap, in bytes. `psram_total` is `0` on a
  board without external RAM. They are read when the command arrives rather than
  taken from the one-second snapshot, so a host that just applied a document
  reads what that document costs now; `*_min` is the low-water mark since boot,
  which is what a memory budget is set against;
- `fps`, `cpu0` and `cpu1` carry one decimal, and every `*_us` field is
  microseconds. They mean exactly what the same names mean in
  [runtime-performance.md](runtime-performance.md), and they come from the
  sampler's last completed interval — a composition that has just changed is
  described a second later;
- `inval_px`, `inval_areas` and `drawn_areas` describe what a frame was asked to
  redraw: the pixels every invalidation covered, how many invalidations there
  were, and how many areas survived LVGL's merging to be drawn and sent. They
  are what turn a render figure into a cost model — see
  [runtime-performance.md](runtime-performance.md);
- `lat_us` and `lat_max_us` are the average and worst end-to-end latency over
  the interval, from a telemetry value's commit into its slot to the display
  accepting the frame that drew it, and `lat_n` is how many frames carried
  one. This is the figure the display latency work is judged by: it covers the
  wake, the render and the flush together, so a change that moves none of the
  parts but reorders them still shows up here;
- `stack_*` is the free stack of each monitored task in bytes. The font and
  image upload tasks share `stack_upload`, reported as the smaller of the two,
  because only one of them can own the link at a time;
- `uptime_ms` is milliseconds since boot.

Nothing here is part of the configuration contract: the field list is a
diagnostic surface that may grow, and a host must read it by name rather than
by position.

## Control commands

The configuration protocol remains line-oriented and shares the selected
telemetry serial transport. Asset upload temporarily switches that same
transport into a binary stop-and-wait mode: `@PR:FONT:` for font packages
(see [Font asset storage](font-assets.md)), `@PR:IMAGE:` for image packages
(see [Image asset storage](image-assets.md)) and `@PR:FW:` for firmware images
(see [Firmware updates](ota.md)). All three share one binary session,
so only one upload owns the stream at a time. On the link an upload owns there
are no more commands until it ends: every byte is a frame, so a second `BEGIN`
sent mid-upload is not a command but a bad frame, and it ends the running
upload with `invalid_frame`. A `BEGIN`, `INFO` or `CLEAR` for any of the three
that finds the binary session closed — startup still reading the partitions — or
already claimed is answered `busy`, under the namespace of the kind that owns
the stream rather than the one that asked, so a host can see which upload is in
the way. None of them is a configuration command, and their bytes are never
stored in configuration NVS.

Every command that carries configuration names one of the three documents.
`<doc>` below is `dashboard`, `modules` or `protocol`, spelled in lower case the
way the contract spells every other value on this wire. A name that is none of
them is answered `@PR:ERR:unknown_document`.

| Request | Successful response | Purpose |
| --- | --- | --- |
| `@PR:INFO` | `@PR:OK:INFO:...` | Read device and storage metadata, and each document's stored record. |
| `@PR:DIAG` | `@PR:OK:DIAG:...` | Read live memory and frame figures. Debug builds only; a product build answers `unsupported`. |
| `@PR:GET:<doc>` | `@PR:OK:CONFIG:<doc>:<JSON>` | Read the exact sparse JSON payload that document would be loaded from: the stored record, or the board's own document while none is held. `@PR:APPLY` does not move it. |
| `@PR:VALIDATE:<doc>:<JSON>` | `@PR:OK:VALID:<doc>` | Validate without saving. |
| `@PR:APPLY:<doc>:<JSON>` | `@PR:OK:APPLIED:<doc>` | Validate and apply to the running composition without saving. |
| `@PR:SET:<doc>:<JSON>` | `@PR:OK:SAVED:<doc>:reboot_required=<0\|1>` | Validate and save. |
| `@PR:RESET:<doc>` | `@PR:OK:RESET:<doc>:reboot_required=1` | Remove one saved document. |
| `@PR:RESET` | `@PR:OK:RESET:reboot_required=1` | Remove every saved document. |
| `@PR:REBOOT` | `@PR:OK:REBOOTING` | Restart the device. |

`reboot_required` on a save is a property of the document, generated from the
schema rather than decided here: `protocol` answers 1 because the link is
selected once at startup, and `dashboard` and `modules` answer 0 because
`@PR:APPLY` brings the running composition up to what was just written. Applying
the protocol document is accepted and stages it, but rebuilds nothing — the
board picks the link up on its next start.

`@PR:INFO` reports `board`, `firmware`, `schema`, `storage`, the four boot-health
fields above, and then one field per document spelled
`<doc>=<outcome>:<generation>`. The outcome is one of
`absent`, `malformed_record`, `unsupported_schema`, `corrupt_payload`,
`rejected` or `valid`; the generation is the stored record's, or `0` when there
is none. `absent` means the record is not there; a storage read that fails
reports `malformed_record`, so a broken NVS partition is never reported as an
unconfigured board. A board running one section from flash and another from its
factory value is an ordinary state, which is why there is no single source token.

Validation errors use `@PR:ERR:<reason>:screen=<n>,widget=<n>,path=<property>`.
The reason token keeps its position, so a host that only reads the reason is
unaffected. `screen` and `widget` are `-1` when the failure is not inside a
widget, and `path` names the property that caused it. `widget` is the position
in the list of the **innermost container that holds it** — a screen's own
`widgets`, a shape's `widgets`, or a slot page's `widgets` — not an index into
the document's widget pools. The whole-dashboard rules report no position at
all: more than one `lap_timer` modifier answers `invalid_widget` with
`path=modifiers`, too many tap targets answers `invalid_widget` with
`path=action`, and a font budget over every widget answers `invalid_widget` with
`path=font`, each with `screen=-1,widget=-1`. The reason tokens are listed in
[configuration-schema.md](configuration-schema.md).

Five errors are about the request rather than the document and carry no
location suffix:

| Response | When |
| --- | --- |
| `@PR:ERR:unknown_command` | The line starts with `@PR:` but names no command above. A host probes for a capability this way. A `@PR:` line longer than the control-line bound is answered the same way rather than being discarded in silence. |
| `@PR:ERR:unsupported` | `APPLY` on a firmware that has no live-apply handler, or on a board in safe mode, which registers none: it composed nothing to apply to and holds no fonts or images to validate against. Also `DIAG` on a product build, which carries no sampler to answer it with. |
| `@PR:ERR:busy` | `SET`, `APPLY` or `RESET` arrived before startup finished composing and it did not finish within ten seconds. The link answers well before the dashboard exists, so a write waits for something to write to; reads never do. Also any `@PR:` command that arrives while another is still being handled — one command is in flight at a time, and only `REBOOT` is answered rather than refused in that window. An asset or firmware `BEGIN`, `INFO` or `CLEAR` in the startup window is answered `busy` under the owning kind's namespace rather than waiting, because startup is still reading the partitions it would erase. |
| `@PR:ERR:unknown_document` | The command named no document, or named one this firmware does not have. |
| `@PR:ERR:storage` | `SET` or `RESET` validated but the write to configuration storage failed. A payload is always parsed and validated first, so `storage` never hides a rejection. |

After reset and reboot, each `GET` returns that document's compiled factory
payload and the board-provided display remains enabled with an empty dashboard.

## Internal persistence

Firmware wraps the exact validated JSON bytes in a private NVS record containing
magic, record version, schema version, payload size, generation, and CRC32. One
record per document is stored in the dedicated `pitrig_cfg` partition, keyed by
the document's name, each with a generation of its own. Firmware writes a record
and reads it back — header, checksum and parse — before believing the write.

There is no second copy of a record. NVS writes a new blob before retiring the
one it replaces, so a torn write leaves the previous record readable, and the
alternating pair this used to keep bought a second copy of that same guarantee.

Configurator code must not reproduce or depend on this NVS record format.

Records of any earlier schema are unsupported and are not migrated. That
document falls back to its compiled factory payload while the other two load
normally. A record that was read but not loaded — another schema version, a
malformed record, a failed checksum, or a document this firmware rejects — is
named in the boot log with its reason, so a device that comes up on a factory
section after a firmware update can be told apart from one that was never
configured. `@PR:INFO` reports the same thing per document.

Startup order is the three factory documents compiled into the firmware, then
whatever is stored, one document at a time on top of them.
