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
  -DSDKCONFIG=/tmp/simcore-sdkconfig-t-display \
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
descriptor, and loads its sparse schema 2 configuration. Configuration editing
and apply operations are added in subsequent configurator phases.

See [docs/device-configuration.md](docs/device-configuration.md) for the public
schema, validation behavior, and recovery order. The Python CLI is retained
only as legacy schema 0 tooling during the migration and must not be used with
schema 2 firmware.
