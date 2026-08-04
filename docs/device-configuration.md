# Device configuration

This document defines the schema 2 configuration contract implemented by the
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

1. Active valid schema 2 NVS slot.
2. Backup valid schema 2 NVS slot.
3. Board-only factory configuration compiled into firmware.

The factory configuration enables no additional hardware devices, modules, or
widgets. A clean flash or reset still initializes a board-provided display, but
the screen has no dashboard content.

Configuration is immutable while firmware is running. A saved replacement
takes effect after restart.

## Sparse authoring format

JSON is the human-readable format for configurator projects and presets. It is
sparse: omitted sections and properties are not expanded through a board
profile.

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
- Unknown properties are rejected.
- Loading a preset inserts only the properties explicitly present in that
  preset.

Board presets are examples, not inheritance profiles. Applying one preset must
not silently add unrelated modules, widgets, or transport settings.

Colors use `"#RRGGBB"`.

## Modules and widgets

The production firmware supports these dashboard widget types:

- `lap_timer`;
- `delta_time`;
- `text`, with at most 16 ordered instances.

Module configuration remains separate from widget presentation. A module may
exist without a widget when its supported behavior requires it. A configured
Lap Timer or Delta Time widget requires its corresponding module to be present;
otherwise validation fails. An empty module object creates that module using
its bounded firmware defaults.

The display screen is the only layout coordinate space. Every widget placement
uses absolute logical pixels:

```json
{
  "x": 16,
  "y": 16,
  "width": 72,
  "height": 72
}
```

Schema 2 has no regions, region identifiers, anchors, or anchor offsets.

Example sparse configuration:

```json
{
  "board": "guition_esp32_4848s040",
  "dashboard": {
    "widgets": {
      "text": [
        {
          "binding": "vehicle.aids.traction_control",
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
  }
}
```

Only the properties shown above are present in the project and public payload.
The text widget supplies its documented defaults for omitted padding, fonts,
colors, alignment, background, title offset, and unavailable text.

The text-widget value displays the exact string received for its telemetry
binding. Units, prefixes, suffixes, decimal places, and other presentation
belong to the telemetry source.

Supported bindings:

- `vehicle.speed`;
- `engine.rpm`;
- `transmission.gear`;
- `session.lap.current_time`;
- `session.lap.best_time`;
- `vehicle.fuel.level`;
- `session.lap.delta`;
- `session.lap.estimated_time`;
- `vehicle.aids.traction_control`;
- `vehicle.aids.abs`;
- `vehicle.brake_bias`;
- `vehicle.fuel.average_consumption`;
- `vehicle.fuel.laps_remaining`.

The only compiled font family is `montserrat`. The public font resolver exposes
the LVGL 10, 24, and 48 px variants; LVGL also retains Montserrat 14 px as its
framework default. Other font references use a stable family identifier plus
`size_px` and will resolve to separately uploaded LVGL binary assets in the
completed font asset flow. Until that asset is installed, or when a requested
built-in size is not available, firmware renders with the nearest public
Montserrat size.

Font family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`,
or `-`. `size_px` is an integer from 1 through 255. Font files and converted
font bytes are not part of this JSON document or configuration NVS.

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
telemetry serial transport.

| Request | Successful response | Purpose |
| --- | --- | --- |
| `@SC:INFO` | `@SC:OK:INFO:...` | Read device and storage metadata. |
| `@SC:GET` | `@SC:OK:CONFIG:<JSON>` | Read the exact sparse schema 2 JSON payload. |
| `@SC:VALIDATE:<JSON>` | `@SC:OK:VALID` | Validate without saving. |
| `@SC:SET:<JSON>` | `@SC:OK:SAVED:reboot_required=1` | Validate and save. |
| `@SC:RESET` | `@SC:OK:RESET:reboot_required=1` | Remove saved configuration. |
| `@SC:REBOOT` | `@SC:OK:REBOOTING` | Restart the device. |

Errors use `@SC:ERR:<reason>`.

After reset and reboot, `GET` returns the board-only factory configuration and
the board-provided display remains enabled with an empty dashboard.

## Public schema 2 payload

The public payload is the bounded sparse JSON document described above. The
configurator sends it directly; there is no binary codec or hexadecimal wrapper.
The serial protocol is line-oriented, so payloads must be compact single-line
JSON without literal CR or LF bytes. Whitespace inside that one line is valid,
but the configurator should use `JSON.stringify` output.

Schema 2 top-level properties:

| Property | Shape | Meaning |
| --- | --- | --- |
| `board` | string, required | Immutable compatible board identifier. |
| `hardware` | array, optional | User-configured peripherals; currently only `[]` is supported. |
| `telemetry_transport` | object, optional | Transport `id` and optional `uart` settings. |
| `lap_timer` | object, optional | Lap Timer module configuration. |
| `delta_time` | object, optional | Delta Time module configuration. |
| `dashboard.widgets` | object, optional | Optional `lap_timer`, `delta_time`, and ordered `text` widgets. |

Nested property names use snake case. Placement uses `x`, `y`, `width`, and
`height`; font uses `family` and `size_px`. UART settings use `port`, `tx_pin`,
`rx_pin`, `baud_rate`, and `silence_esp_logs`. Style properties follow the
names used in the sparse example, including `text_color`, `faster_color`,
`slower_color`, `neutral_color`, `background_color`, `width_px`, `radius_px`,
and `offset_y_px`.

The current board mappings expose GPIO 43 for UART TX and GPIO 44 for UART RX;
other pairs are rejected to prevent collisions with display, flash, PSRAM,
strapping, or USB pins. Native USB CDC is supported by `t_display_s3`; the
Guition display mapping occupies a native USB pin and therefore uses its board
default UART transport.

Firmware parses every received or persisted document and rejects malformed
JSON, unknown or duplicate properties, unsupported component shapes, board
mismatches, values outside bounded ranges, invalid bindings, and invalid widget
geometry. Validation in the configurator improves feedback but does not replace
this firmware boundary check.

The configurable `hardware` array currently accepts only an empty array because
no user-configurable peripheral driver has a complete production contract yet.
Non-empty entries are rejected rather than guessed. Adding or changing public
properties requires a later documented schema version.

Schema 2 retains deterministic limits:

- maximum compact JSON payload size: 4096 bytes;
- maximum text widgets: 16;
- maximum canonical telemetry binding: 39 UTF-8 bytes;
- maximum title: 15 UTF-8 bytes;
- maximum unavailable text: 15 UTF-8 bytes;
- maximum font family identifier: 31 ASCII bytes;
- font size range: 1 through 255 pixels.

## Internal persistence

Firmware wraps the exact validated JSON bytes in a private NVS record containing
magic, record version, schema version, payload size, generation, and CRC32.
Two records are stored in the dedicated `simcore_cfg` partition. Firmware
writes and verifies the inactive slot before selecting it.

Configurator code must not reproduce or depend on this NVS record format.

Schema 0 and schema 1 records are unsupported and are not migrated. They fall
back to another valid schema 2 slot or the board-only factory configuration.

## CLI retirement

The Python configuration CLI is retained temporarily for legacy schema 0
firmware and is not compatible with schema 2. It must be removed, together with
its requirements and CLI-specific profiles, after the desktop configurator
implements the complete `INFO`, `GET`, `VALIDATE`, `SET`, `RESET`, and `REBOOT`
round trip.
