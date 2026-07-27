# SimCore

Open-source platform for DIY sim racing hardware.

Status: Early development.

## Firmware board selection

The firmware contains every supported display driver and selects one during
startup from the application configuration. LilyGO T-Display-S3 is the default.

Set `kApplicationConfiguration.board.id` in
`firmware/platform/application_config/include/application_configuration.hpp`:

```cpp
.board = {
    .id = BoardId::guition_esp32_4848s040,
},
```

Build the universal firmware normally:

```sh
cd firmware
idf.py build
```

Changing the configured board does not change which drivers are included in
the firmware image.
