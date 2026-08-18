# SimCore

Open-source platform for DIY sim racing hardware.

Status: Early development.

## Device configuration

A firmware build defines one immutable physical board identity and its built-in
display; persistent user configuration cannot change either. A clean flash
initializes that display with an empty dashboard. Each build links only the
drivers its target needs, so the board is chosen at build time rather than at
runtime.

Build for one board:

```sh
cd firmware
idf.py -B build-t-display \
  -DIDF_TARGET=esp32s3 \
  -DSDKCONFIG=sdkconfig.generated.t-display \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" \
  build
```

[CLAUDE.md](CLAUDE.md) carries the command for every supported board.

Run the desktop configurator after flashing:

```sh
cd configurator
pnpm install
pnpm run dev
```

The configurator identifies the connected board, reports its read-only display
descriptor, loads and previews its sparse configuration, validates and
saves configuration changes, manages uploaded font and image assets, and can
reset or reboot the device.

See [docs/device-configuration.md](docs/device-configuration.md) for the public
schema, validation behavior, control protocol, and recovery order.
