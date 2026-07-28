# SimCore

Open-source platform for DIY sim racing hardware.

Status: Early development.

## Device configuration

The firmware contains every supported display driver and selects one during
startup from persistent device configuration. On a fresh device it uses the
factory board profile selected by the T-Display or Guition build configuration.
That profile is the firmware's immutable hardware identity, so a configuration
for the other board is rejected.

Build the universal firmware normally:

```sh
cd firmware
idf.py -B build-t-display \
  -DSDKCONFIG=/tmp/simcore-sdkconfig-t-display \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" \
  build
```

After flashing, inspect or replace configuration over the board's serial port:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/requirements.txt

# T-Display-S3
python3 tools/simcore_config.py info
python3 tools/simcore_config.py apply config/t-display-s3.json

# Guition ESP32-4848S040
python3 tools/simcore_config.py info
python3 tools/simcore_config.py apply config/guition-esp32-4848s040.json
```

See [docs/device-configuration.md](docs/device-configuration.md) for the JSON
schema, automatic port detection, validation behavior, recovery order, and all
CLI commands. Changing the configured board is not permitted even though all
supported drivers remain included in the firmware image.
