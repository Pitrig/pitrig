# Device configuration

SimCore loads device configuration in this order:

1. Active valid NVS slot.
2. Backup valid NVS slot.
3. Factory defaults compiled into firmware.

The configuration is immutable while the firmware is running. A saved
replacement takes effect after restart.

The T-Display and Guition builds select their immutable hardware identity with
`CONFIG_SIMCORE_FACTORY_BOARD_*`. A configuration for another board is rejected.

## Configuration files

Board examples:

- `config/t-display-s3.json`
- `config/guition-esp32-4848s040.json`

Canonical board profiles are stored under `config/profiles/`. Sparse files use
a string `board` identifier and inherit omitted values from the matching
profile:

```json
{
  "board": "t_display_s3"
}
```

RGB colors use `"#RRGGBB"`. Unknown fields are rejected.

## Dashboard widgets

The production dashboard contains three widget implementations:

- `lap_timer`
- `delta_time`
- `text`

Debug builds may additionally create the performance overlay or display
diagnostics.

`lap_timer` and `delta_time` are presence-driven. Text widgets are an ordered
array with a maximum of 16 instances:

```json
{
  "board": "guition_esp32_4848s040",
  "dashboard": {
    "widgets": {
      "lap_timer": {},
      "delta_time": {},
      "text": [
        {
          "binding": "vehicle.aids.traction_control",
          "placement": {
            "region_id": 0,
            "anchor": "top_left",
            "offset_x": 16,
            "offset_y": 16,
            "width": 72,
            "height": 72
          },
          "padding": {
            "left": 4,
            "top": 4,
            "right": 4,
            "bottom": 4
          },
          "border": {
            "color_rgb": "#00E5FF",
            "width_px": 3,
            "radius_px": 8
          },
          "title": {
            "text": "TC",
            "font": {
              "family": "montserrat",
              "size_px": 10
            },
            "color_rgb": "#E8E8E8",
            "offset_y_px": 0
          },
          "value": {
            "font": {
              "family": "montserrat",
              "size_px": 48
            },
            "color_rgb": "#E8E8E8",
            "alignment": "center",
            "unavailable_text": "--"
          },
          "background_color_rgb": "#000000"
        }
      ]
    }
  }
}
```

The title is static. A non-empty title is centered over the top border and
creates a background-colored gap in that border. An empty title disables both
the label and the gap.

The value is never formatted by the widget. It displays the exact string
received for its telemetry binding. Units, prefixes, suffixes, decimal places,
and other presentation belong to the telemetry source.

Supported bindings:

- `vehicle.speed`
- `engine.rpm`
- `transmission.gear`
- `session.lap.current_time`
- `session.lap.best_time`
- `vehicle.fuel.level`
- `session.lap.delta`
- `session.lap.estimated_time`
- `vehicle.aids.traction_control`
- `vehicle.aids.abs`
- `vehicle.brake_bias`
- `vehicle.fuel.average_consumption`
- `vehicle.fuel.laps_remaining`

Supported compiled fonts:

- `montserrat`: 10, 24, 48 px
- `lcd`: 39, 43, 47, 53 px
- `roboto_mono`: 43 px

## Commands

Install the CLI dependency:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/requirements.txt
```

Inspect a device:

```bash
python3 tools/simcore_config.py info
python3 tools/simcore_config.py show
```

Validate or apply a file:

```bash
python3 tools/simcore_config.py validate config/t-display-s3.json
python3 tools/simcore_config.py apply config/t-display-s3.json
```

Restore factory defaults:

```bash
python3 tools/simcore_config.py reset
```

Use `--port` when more than one SimCore device is connected. SimHub and serial
monitors must release the selected serial port before the CLI opens it.

## Wire format and compatibility

Configuration schema versioning starts at 0. The active binary format supports
schema 0 only. Records with another schema version fall back to factory
defaults.

Schema 0 has fixed capacities:

- one dashboard region;
- up to 16 text widgets;
- 39 UTF-8 bytes for a canonical telemetry binding;
- 15 UTF-8 bytes for a title;
- 15 UTF-8 bytes for unavailable text;
- 2560 bytes for the complete binary payload.

Records are stored in two slots inside the dedicated `simcore_cfg` NVS
partition. Writes verify the inactive slot before selecting it, and recovery
never erases the default NVS partition.
