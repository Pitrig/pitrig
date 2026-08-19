# Firmware updates over serial

A SimCore board carries two application partitions and runs one of them. A new
image is uploaded into the other over the same serial link that carries
telemetry and configuration, and takes over at the next restart. If it cannot
finish starting up, the bootloader returns to the slot it came from.

The decisions behind this are in
[ADR 0022](adr/0022-over-the-air-firmware-updates.md).

## Partition layout

| Name | Type | Offset | Size |
| --- | --- | ---: | ---: |
| `nvs` | data, nvs | `0x9000` | 16 KiB |
| `otadata` | data, ota | `0xD000` | 8 KiB |
| `phy_init` | data, phy | `0xF000` | 4 KiB |
| `ota_0` | app | `0x10000` | 2 MiB |
| `ota_1` | app | `0x210000` | 2 MiB |
| `simcore_cfg` | data, nvs | `0x410000` | 1 MiB |
| `font_assets` | data, `0x40` | `0x510000` | 2 MiB |
| `image_assets` | data, `0x41` | `0x710000` | 4 MiB |

The table ends at `0xB10000`, leaving 4.94 MiB of the 16 MiB part unallocated.
There is no `factory` partition: a board whose two slots are both unusable is
recovered over USB with `idf.py flash`.

**Installing this table is a full erase.** Every data partition moved from
where it was before, so the stored configuration, the font package and the
image package are all discarded. Erase and flash, then re-save the
configuration and re-upload the assets:

```bash
idf.py -B build-t-display -p <port> erase-flash flash monitor
```

## Rollback

Builds select `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`. An image installed over
serial boots in `ESP_OTA_IMG_PENDING_VERIFY`, and `core` clears that state only
after startup has finished: the configuration loaded, the display came up, the
dashboard composed and the communication link answers. An image that resets
before reaching that point is rolled back to the previous slot by the
bootloader.

`@SC:FW:INFO` reports `pending_verify=1` for the window in which this matters,
which on a healthy board is the fraction of a second before startup completes.

## Package layout

The application image travels inside the same 32-byte header the font and image
packages use, followed by one manifest entry naming the board.

| Offset | Size | Field |
| ---: | ---: | --- |
| `0x0000` | 32 | Header |
| `0x0020` | 2 | Manifest entry: `BoardId`, little endian |
| following | until `0x0040` | Reserved; ignored by version 1 |
| `0x0040` | variable | The application image, byte for byte as built |

### Header

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `u32` | magic | bytes `SCFW` |
| 4 | `u16` | format version | `1` |
| 6 | `u16` | header size | `32` |
| 8 | `u32` | reserved | zero |
| 12 | `u16` | entry count | `1` |
| 14 | `u16` | reserved | zero |
| 16 | `u32` | payload size | exact package size, `0x40` plus the image |
| 20 | `u32` | manifest CRC | bytes `[0x20, 0x22)` |
| 24 | `u32` | payload CRC | bytes `[0x40, payload_size)` |
| 28 | `u32` | header CRC | bytes `[0, 28)` |

The manifest entry exists because ESP-IDF cannot make this check. It refuses an
image built for another chip, but the T-Display-S3 and the Guition
ESP32-4848S040 are both ESP32-S3, and an image swapped between them boots with
the wrong display driver. Firmware validates the whole header before it opens
the OTA write handle, so an image for the wrong board never reaches flash.

The image itself is the `simcore.bin` a build produces. Nothing is stripped from
it and nothing is added inside it.

## Serial upload protocol

The frames are the `SCF1` frames described in
[Font asset storage](font-assets.md); only the command namespace differs.
Firmware, fonts and images share one binary session, so whichever kind claims
the stream first owns it and the others are answered `busy`.

The host can query firmware state without starting an upload:

```text
@SC:FW:INFO
@SC:OK:FW:INFO:storage=1,running=ota_0,target=ota_1,version=1.0.0,pending_verify=0,reboot_required=0
```

`storage` reports whether a second slot exists to update into. `running` and
`target` name the partition in use and the one the next upload lands in.
`version` is the running image's version string. `pending_verify` is set while
the running image still has to be confirmed. `reboot_required` is set after a
successful commit until restart.

`@SC:FW:CLEAR` is rejected with `invalid_state`. The only images on the device
are the one running and the one it would fall back to, and neither can be
erased on request.

The host starts a session with the complete package size, including the header:

```text
@SC:FW:BEGIN:size=<bytes>
@SC:OK:FW:READY:max_chunk=1024
```

Unlike the asset kinds, nothing is erased at `BEGIN`. The write handle is opened
only once the first 64 bytes have arrived and the header has named this board;
until then a rejected package costs nothing. Frames, acknowledgements, commit
and cancel are identical to the font upload:

```text
@SC:OK:FW:ACK:sequence=<n>,received=<bytes>
@SC:OK:FW:COMMITTED:reboot_required=1
```

The commit verifies the payload CRC, ends the OTA write and selects the target
partition as the boot partition. `@SC:REBOOT` then starts the new image.

## Configurator

The **Firmware** panel appears when the connected board answers `@SC:FW:INFO`.
It shows the running slot and version, the slot an upload lands in, takes a
`simcore.bin`, wraps it for the connected board and installs it. Firmware built
before this partition layout answers `unknown_command`, and the panel reports
that the board cannot update itself over serial.
