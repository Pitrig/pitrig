# Device configuration

This document defines the schema 3 configuration contract implemented by the
firmware and read by the desktop configurator. Earlier schemas are
intentionally not part of the current contract.

## Hardware identity and user configuration

Every firmware build selects one immutable hardware board identity with
`CONFIG_SIMCORE_FACTORY_BOARD_*`. The board registry resolves that identity to
the firmware drivers for hardware physically built into that board. Firmware
reports the stable board identifier; the configurator maps it to its local
supported board profile.

User configuration cannot change the physical board. Every configuration must
contain the same board identifier, and a mismatch is rejected before saving.

Configurator board profiles:

| Board identifier | Logical display |
| --- | --- |
| `t_display_s3` | 320 × 170 |
| `guition_esp32_4848s040` | 480 × 480 |
| `guition_jc1060p470c` | 1024 × 600 |

Hardware is composed from two sources:

1. **Board-provided hardware** is physically built into the selected board and
   declared by its immutable board-registry mapping.
2. **User-configured hardware** is an optional bounded list of supported
   devices and driver settings in the sparse device configuration.

The user-configured hardware list may be empty. It is not limited to displays:
supported entries may represent buttons, encoders, LEDs, touch controllers, or
other peripherals. Only hardware types and drivers implemented by the current
firmware may appear in the list.

For the current configurator contract, a display provided by the board is
enabled by default. Its driver, transport, pin assignments, logical dimensions,
and other board-owned settings are read-only. The configurator displays this
information but does not allow the user to disable, replace, or edit the
built-in display. The optional hardware list therefore does not duplicate that
display. Logical dimensions are held by the configurator board profile rather
than transmitted by firmware or stored in device configuration.

SimCore loads user configuration in this order:

1. Active valid schema 3 NVS slot.
2. Backup valid schema 3 NVS slot.
3. Board-only factory configuration compiled into firmware.

The factory configuration enables no additional hardware devices, modules, or
widgets. A clean flash or reset still initializes a board-provided display, but
the screen has no dashboard content.

A saved replacement takes effect after restart. `APPLY` is the exception: it
validates a document and rebuilds the running dashboard from it without writing
storage, so an editor can preview a change live. The stored configuration is
unchanged, and a restart returns to it.

## Sparse authoring format

JSON is the human-readable format for configurator projects and presets. It is
sparse: omitted sections and properties are not expanded through a board
profile.

The configurator can create, load, save, and edit this JSON without a connected
device. The root `board` selects the local immutable board profile used for
display dimensions and preview. A local draft remains available after a
disconnect and is not replaced when another device connects. **Reload board**
is the explicit operation that discards the local draft in favor of the
connected device configuration. **Save to board** requires the draft and
connected device to have the same board identifier.

The smallest valid configuration is:

```json
{
  "board": "t_display_s3"
}
```

This configuration produces an empty dashboard on the board-provided display
and creates no additional user-configured hardware devices.

Presence rules:

- `board` is always required.
- The optional user-configured hardware list may be absent or empty.
- A missing user-configured hardware device, module, or widget is disabled and
  is not created.
- Missing user-configured hardware does not disable capabilities declared as
  built into the board.
- A missing property inside a present component uses that component's bounded
  firmware default.
- A missing telemetry transport uses the immutable board default.
- The default telemetry UART baud rate is `921600` and matches the checked-in
  complete SimHub profile and the configurator profile generator's fallback.
- Unknown properties are rejected.
- Loading a preset inserts only the properties explicitly present in that
  preset.

Board presets are examples, not inheritance profiles. Applying one preset must
not silently add unrelated modules, widgets, or transport settings.

Colors use `"#RRGGBB"`.

## Modules and widgets

A dashboard owns a bounded `screens` array; `dashboard.screens[0]` is the only
screen composed today. Each screen carries its own `id`, `background_color`, and
one ordered `widgets` array discriminated by a `type` property. Every widget also
carries a stable `id`.

The production firmware supports these widget types:

- `text`, with at most 16 instances per screen;
- `delta_time`, with at most one instance per screen.

Module lifecycle is derived from configured consumers. A `lap_timer` modifier
activates the Lap Timer module automatically; there is no separate root Lap
Timer object or dedicated Lap Timer widget. A configured Delta Time widget
still requires its root Delta Time module object.

A screen is the layout coordinate space for the widgets it owns. Every widget
placement uses absolute logical pixels:

```json
{
  "x": 16,
  "y": 16,
  "width": 72,
  "height": 72
}
```

The schema has no regions, region identifiers, anchors, or anchor offsets.

Example sparse configuration:

```json
{
  "board": "guition_esp32_4848s040",
  "dashboard": {
    "screens": [
      {
        "id": "main",
        "widgets": [
          {
            "type": "text",
            "id": "tc",
            "binding": "vehicle.aids.traction_control_level",
            "placement": {
              "x": 16,
              "y": 16,
              "width": 72,
              "height": 72
            },
            "border": {
              "color": "#00E5FF",
              "width_px": 3,
              "radius_px": 8
            },
            "title": {
              "text": "TC"
            }
          }
        ]
      }
    ]
  }
}
```

Only the properties shown above are present in the project and public payload.
The text widget supplies its documented defaults for omitted padding, fonts,
colors, alignment, background, title offset, and unavailable text.

Until a value arrives, a widget renders its placeholder. An explicit
`unavailable_text` is that placeholder; omitting it renders a zero through the
widget's own transform, so a plain value reads `0` and a time value keeps its
format with every field zeroed, such as `00:00.000`. The Delta Time module
behaves the same way: its default `unavailable_behavior` is `zero`, and
`placeholder` applies only when that behavior is set to `placeholder`.

The `binding` property always identifies the canonical telemetry source. An
ordered modifier pipeline may change the typed value before its presentation
transform:

```json
{
  "binding": "session.lap.current_time",
  "modifiers": [
    {
      "type": "lap_timer"
    }
  ],
  "transform": {
    "type": "time",
    "format": "duration_ms",
    "prefix": "LAP ",
    "suffix": ""
  }
}
```

The `lap_timer` modifier accepts only the unsigned
`session.lap.current_time` binding. It preserves the numeric millisecond type
while applying smooth local progression, correction, lap restart detection,
and a fixed one-second stale-telemetry timeout. Its presence activates the
module automatically. The current implementation allows at most one Lap Timer
modifier across the dashboard.

Text widgets support the optional `time` transform:

- `duration_ms` accepts unsigned milliseconds and renders `MM:SS.mmm`;
- `signed_duration_ms` accepts signed milliseconds and renders `+S.mmm` or
  `-S.mmm`.

Without `transform`, source text is preserved; a modifier-produced numeric
value is rendered as a base-10 integer. Optional `prefix` and `suffix` strings
are applied by the time transform and are each limited to 15 UTF-8 bytes. Incompatible
binding, modifier, and transform types are rejected before the dashboard is
created.

Supported bindings are listed in the generated
[telemetry catalog](telemetry-catalog.md). The configurator exposes these fields
through a searchable binding input and shows the selected field's category,
type, unit, recommended update rate, and wire ID.

The configurator provides direct manipulation for configured dashboard
widgets. Selecting a widget on the display preview exposes its schema-backed
properties in the inspector. Dragging and resizing write absolute logical
`x`, `y`, `width`, and `height` values and keep the widget within the immutable
display bounds. Selecting empty canvas space exposes the screen-level opaque
`background_color`. The advanced JSON editor remains available and edits the
same draft used by the canvas, validation, font dependency check, and save
flow.

Every widget may define `z_index` from `-32768` through `32767`. Larger values
render above smaller values. Missing values default to zero; equal values use
stable configuration order so the configurator preview and firmware display
remain identical.

The preview toolbar exposes only `Add` and `Delete`. `Add` opens a widget-type
picker; the current editor creates a Text widget with only a centered 120 × 64
logical-pixel placement (clamped for smaller displays), leaving its content and
style fields unset for explicit configuration in the inspector. `Delete`
requires confirmation and removes the selected widget. Delta Time remains
loadable and editable when present in an existing configuration, but is not
offered by the add picker.

Production firmware exposes no compiled dashboard font families. Every widget
font reference uses a stable family identifier plus `size_px` and resolves to
an uploaded TTF or OTF face that the device rasterizes at the requested size.
Widget fonts must be explicit; a text widget without a title does not require a
title font. Family resolution is exact: an unavailable family causes dashboard
composition to report an error instead of silently selecting another font. A
pixel size never fails to resolve, because it is rasterized from the installed
face.

Font family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`,
or `-`. `size_px` is an integer from 1 through 255. One configuration may
reference at most 8 families. Font files are not part of this JSON document or
configuration NVS.

Uploaded faces are stored as one checksummed package in a dedicated partition.
The package format and firmware validation rules are defined in
[Font asset storage](font-assets.md), including its separate bounded serial
upload protocol. Installing a new package requires a reboot before its families
can be selected; changing only a `size_px` of an installed family requires
neither an upload nor a restart. Before applying a configuration, the
configurator compares its required families with the device catalog. When a
family is missing it collects one TTF/OTF source per family, replaces the
complete package, and then saves the configuration.

## Device information

`INFO` reports immutable device metadata and configuration storage status:

```text
@SC:INFO
@SC:OK:INFO:board=t_display_s3,firmware=<version>,schema=2,source=factory,generation=0,storage=1
```

Fields:

- `board` is the immutable factory board identifier;
- `firmware` comes from the ESP-IDF application description;
- `schema` is the supported public configuration schema;
- `source` is the configuration source active in the current runtime and is
  `factory`, `slot_a`, or `slot_b`;
- `generation` is the stored-record generation active in the current runtime;
- `storage` is `1` when persistent configuration storage is available.

The configurator must resolve display information from the `board` field and
its local supported-board registry, present it as read-only device information,
and must not infer physical hardware from a saved user configuration. An
unknown board is incompatible until the configurator adds an explicit board
profile. Boards without a built-in display require a separately documented
profile before they are supported.

`SET` and `RESET` update persistent state but do not change `INFO` or `GET`
until reboot. This keeps both operations consistent with the configuration
currently used by modules and widgets.

## Control commands

The configuration protocol remains line-oriented and shares the selected
telemetry serial transport. Font package upload temporarily switches that same
transport into the binary stop-and-wait mode defined in
[Font asset storage](font-assets.md); it is not a configuration command and its
bytes are never stored in configuration NVS.

| Request | Successful response | Purpose |
| --- | --- | --- |
| `@SC:INFO` | `@SC:OK:INFO:...` | Read device and storage metadata. |
| `@SC:GET` | `@SC:OK:CONFIG:<JSON>` | Read the exact sparse schema 3 JSON payload. |
| `@SC:VALIDATE:<JSON>` | `@SC:OK:VALID` | Validate without saving. |
| `@SC:APPLY:<JSON>` | `@SC:OK:APPLIED` | Validate and apply to the running dashboard without saving. |
| `@SC:SET:<JSON>` | `@SC:OK:SAVED:reboot_required=1` | Validate and save. |
| `@SC:RESET` | `@SC:OK:RESET:reboot_required=1` | Remove saved configuration. |
| `@SC:REBOOT` | `@SC:OK:REBOOTING` | Restart the device. |

Errors use `@SC:ERR:<reason>:screen=<n>,widget=<n>,path=<property>`. The reason
token keeps its position, so a host that only reads the reason is unaffected.
`screen` and `widget` are `-1` when the failure is not inside a widget, and
`path` names the property that caused it. The reason tokens are listed in
[configuration-schema.md](configuration-schema.md).

After reset and reboot, `GET` returns the board-only factory configuration and
the board-provided display remains enabled with an empty dashboard.

## Public schema 3 payload

The public payload is the bounded sparse JSON document described above. The
configurator sends it directly; there is no binary codec or hexadecimal wrapper.
The serial protocol is line-oriented, so payloads must be compact single-line
JSON without literal CR or LF bytes. Whitespace inside that one line is valid,
but the configurator should use `JSON.stringify` output.

Schema 3 top-level properties:

| Property | Shape | Meaning |
| --- | --- | --- |
| `board` | string, required | Immutable compatible board identifier. |
| `hardware` | array, optional | User-configured peripherals; currently only `[]` is supported. |
| `telemetry_transport` | object, optional | Transport `id` and optional `uart` settings. |
| `delta_time` | object, optional | Delta Time module configuration. |
| `dashboard.screens` | array, optional | Bounded screen list; currently at most one entry. |

Nested property names use snake case. Placement uses `x`, `y`, `width`, and
`height`; widget stacking uses `z_index`; font uses `family` and `size_px`. UART settings use `port`, `tx_pin`,
`rx_pin`, `baud_rate`, and `silence_esp_logs`. Style properties follow the
names used in the sparse example, including `faster_color`,
`slower_color`, `neutral_color`, `background_color`, `width_px`, `radius_px`,
and `offset_y_px`.

The current board mappings expose GPIO 43 for UART TX and GPIO 44 for UART RX;
other pairs are rejected to prevent collisions with display, flash, PSRAM,
strapping, or USB pins. Native USB CDC is supported by `t_display_s3` and
`guition_jc1060p470c`. The `guition_esp32_4848s040` display mapping occupies a
native USB pin and therefore uses its board-default UART transport. Explicit
UART configuration is not exposed for `guition_jc1060p470c` until a safe board
connector pin mapping is part of the public hardware contract.

Firmware parses every received or persisted document and rejects malformed
JSON, unknown or duplicate properties, unsupported component shapes, board
mismatches, values outside bounded ranges, invalid or incompatible bindings,
modifiers, and transforms, and invalid widget geometry. Validation in the
configurator improves feedback but does not replace this firmware boundary
check.

The configurable `hardware` array currently accepts only an empty array because
no user-configurable peripheral driver has a complete production contract yet.
Non-empty entries are rejected rather than guessed. Breaking changes to public
properties require a later documented schema version; compatible bounded
extensions must be recorded in an ADR.

The schema retains deterministic limits. They are generated from
`configuration/configuration_schema.json` together with the firmware structures
and the configurator types, and the current values are listed in
[configuration-schema.md](configuration-schema.md). The payload bound is 16384
bytes of compact JSON.

The property table, object shapes, enumerations, and rejection reasons in that
generated reference are authoritative; this document describes the rules around
them.

## Internal persistence

Firmware wraps the exact validated JSON bytes in a private NVS record containing
magic, record version, schema version, payload size, generation, and CRC32.
Two records are stored in the dedicated `simcore_cfg` partition. Firmware
writes and verifies the inactive slot before selecting it.

Configurator code must not reproduce or depend on this NVS record format.

Schema 0 and schema 1 records are unsupported and are not migrated. They fall
back to another valid schema 3 slot or the board-only factory configuration.

## Legacy tooling

The schema 0 Python configuration CLI and its inheritance profiles were removed
after the desktop configurator implemented the complete `INFO`, `GET`,
`VALIDATE`, `SET`, `RESET`, and `REBOOT` round trip. Current tooling authors and
transfers only the sparse schema 3 JSON document described here.
