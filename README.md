# SimCore

Open-source platform for DIY sim racing hardware.

Status: Early development.

## Device configuration

The firmware contains every supported display driver. The selected firmware
build defines the immutable physical board identity and its built-in display;
persistent user configuration cannot change either. A clean flash initializes
that display with an empty dashboard.

Build the universal firmware normally:

```sh
cd firmware
idf.py -B build-t-display \
  -DSDKCONFIG=sdkconfig.generated.t-display \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" \
  build
```

Run the desktop configurator after flashing:

```sh
cd configurator
pnpm install
pnpm run dev
```

The configurator identifies the connected board, reports its read-only display
descriptor, loads and previews its sparse schema 5 configuration, validates and
saves configuration changes, manages uploaded font and image assets, and can
reset or reboot the device.

See [docs/device-configuration.md](docs/device-configuration.md) for the public
schema, validation behavior, control protocol, and recovery order.
