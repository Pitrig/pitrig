# Device configuration

SimCore loads device configuration in this order:

1. Active valid NVS slot.
2. Backup valid NVS slot.
3. Factory defaults compiled into firmware.

The loaded configuration is immutable for the lifetime of the firmware. Saving
a replacement therefore requires a restart before it becomes active.

The T-Display and Guition build configurations select matching factory
profiles through `CONFIG_SIMCORE_FACTORY_BOARD_*`. The selected profile defines
the immutable hardware identity of that firmware build:

- T-Display builds accept only `t_display_s3`;
- Guition builds accept only `guition_esp32_4848s040`.

Every supported driver remains linked in the firmware image, but `board.id`
cannot be used to switch a build to different hardware.

For a reproducible clean build, combine the common and board defaults:

```bash
idf.py -B build-t-display \
  -DSDKCONFIG=/tmp/simcore-sdkconfig-t-display \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" \
  build

idf.py -B build-guition \
  -DSDKCONFIG=/tmp/simcore-sdkconfig-guition \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.guition-esp32-4848s040" \
  build
```

## Requirements

The command-line tool uses Python 3 and `pyserial`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/requirements.txt
```

Concise board-specific examples are provided in:

- `config/t-display-s3.json` — 320×170 layout and native USB CDC;
- `config/guition-esp32-4848s040.json` — centered 320×170 dashboard area on
  the 480×480 display and UART0 on GPIO43/GPIO44.

Copy the matching file and edit the copy. These files are sparse: missing
general fields inherit the selected board profile. Full canonical profiles used
by the CLI are stored under `config/profiles/`.

The `board` field selects the profile:

```json
{
  "board": "t_display_s3"
}
```

RGB colors are JSON strings in `"#RRGGBB"` format, for example `"#00C853"`.
The firmware validates the entire
configuration, including board/transport compatibility, UART pins, regions,
fonts, and widget references, before writing NVS. A configuration whose
board does not match the firmware build is rejected with
`@SC:ERR:board_mismatch` and is not written.

At startup, an NVS slot containing a configuration for another board is treated
as invalid. SimCore tries the other slot and then falls back to the factory
configuration, following the recovery order above.

Widgets use presence-driven configuration. Only widgets listed under
`dashboard.widgets` are enabled:

```json
{
  "board": "guition_esp32_4848s040",
  "dashboard": {
    "widgets": {
      "lap_timer": {},
      "gear": {
        "placement": {
          "offset_y": 24
        }
      }
    }
  }
}
```

Here `lap_timer` and `gear` inherit their board defaults. Other widgets are not
created, do not allocate LVGL objects or timers, and their dedicated feature
modules are not started. Missing fields outside `dashboard.widgets`, such as
`telemetry_transport`, inherit board defaults. Unknown fields and widget names
are rejected instead of being ignored.

Legacy complete JSON files with an object-valued `board` field remain accepted.
The CLI normalizes either JSON form into the complete schema 4 binary snapshot
before validation or storage.

## Commands

Inspect the running device:

```bash
python3 tools/simcore_config.py info
python3 tools/simcore_config.py show
```

When `--port` is omitted, the CLI probes attached USB serial ports with
`@SC:INFO` and selects the one that identifies itself as SimCore. If multiple
SimCore devices are connected, select one explicitly with
`--port /dev/ttyUSB0`.

The safest starting point for a particular board is its running factory
configuration:

```bash
python3 tools/simcore_config.py show > device-config.json
```

Edit that file and use it with `validate` or `apply`.

Validate without writing:

```bash
python3 tools/simcore_config.py validate config/t-display-s3.json
```

Save, verify, select, and restart into the new configuration:

```bash
python3 tools/simcore_config.py apply config/t-display-s3.json
```

Use `--no-reboot` after `apply` to defer activation. Restore factory defaults:

```bash
python3 tools/simcore_config.py reset
```

For native USB CDC boards use the `/dev/ttyACM*` device where appropriate when
selecting a port manually. The baud argument is electrically relevant for UART
boards; it defaults to 115200. Stop SimHub or any serial monitor before running
the CLI because a serial port normally cannot be opened by two applications at
the same time.

## Control protocol

Control frames are newline-terminated ASCII and start with `@SC:`. Binary
configuration payloads use uppercase or lowercase hexadecimal encoding.

```text
@SC:INFO
@SC:GET
@SC:VALIDATE:<hex payload>
@SC:SET:<hex payload>
@SC:RESET
@SC:REBOOT
```

Responses begin with `@SC:OK:` or `@SC:ERR:`. Lines without the `@SC:` prefix
continue to the SimHub telemetry parser.

Schemas 1–4 use exactly one dashboard region because the current application
configuration has fixed storage for one region. Schema 2 adds widget `enabled`
flags. Schema 3 adds the board-limited gear widget, including font, placement,
padding, border, and colors. Schema 1 and 2 payloads remain readable; the gear
widget receives board defaults while the older widget behavior remains
unchanged. Schema 4 adds the numeric-only speed widget with enable, font,
placement, and text color settings. Earlier payloads receive the board default:
enabled on Guition and disabled on T-Display. Future variable-sized
configuration must introduce bounded capacities and a new schema.

## Storage isolation

SimCore records are stored in the dedicated `simcore_cfg` NVS partition.
Recovery erases only this partition. The default NVS partition and unrelated
namespaces are never erased by the configuration adapter.

After first installing a firmware build with the new partition table, reapply
any configuration previously stored in the default NVS partition. The old data
is left untouched but is no longer used by SimCore.
