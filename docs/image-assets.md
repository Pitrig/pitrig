# Image asset storage

This document defines image asset package format version 1. It is the contract
between the configurator and the firmware image asset service. It is separate
from the device configuration schema and from configuration NVS.

A package carries images already in the pixel layout the display draws and at
the size the widget draws them at. The device holds no decoder and neither
scales nor rotates: conversion happens in the configurator
([ADR 0018](adr/0018-uploaded-image-assets.md)).

## Storage model

Firmware reserves one raw 4 MiB data partition named `image_assets`, placed
immediately after `font_assets` so nothing already installed moves. At startup
it validates the stored package. If the package is absent or invalid, no images
are available and a configuration naming one is rejected.

An update erases and replaces the complete partition. Bytes after the 32-byte
header are written first. The header stays in RAM and is written only after the
complete candidate package passes validation. An interrupted upload therefore
leaves an invalid package; there is no second slot and no previous generation to
recover.

A successfully committed package becomes active after reboot. The package is
mapped read-only at startup and firmware copies every image into external RAM
before the dashboard is built, because the next `BEGIN` unmaps and erases the
partition unconditionally — a live LVGL descriptor pointing into that mapping
would dangle. The copy costs what was uploaded rather than the partition size.

After a successful commit, the service rejects another update until reboot.

## Integer and checksum encoding

All multi-byte integers are unsigned little-endian values. Reserved fields must
be zero. CRC fields use standard CRC-32/ISO-HDLC (`0xEDB88320` reflected
polynomial, initial value `0xFFFFFFFF`, final XOR `0xFFFFFFFF`).

## Package layout

| Offset | Size | Field |
| ---: | ---: | --- |
| `0x0000` | 32 | Header |
| `0x0020` | `entry_count * 64` | Manifest entries |
| following | until `0x1000` | Reserved; ignored by version 1 |
| `0x1000` | variable | 64-byte aligned image data |

`payload_size` is the exact package size and may not exceed 4 MiB. Every asset
range must be fully contained in `[0x1000, payload_size)`. Asset offsets are
64-byte aligned — the cache line on both targets and the ESP32-P4 draw-buffer
alignment — and must not overlap.

### Header

Byte for byte the font package header, so the two formats stay readable side by
side; only the magic tells them apart.

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `u32` | magic | bytes `SCIA` |
| 4 | `u16` | format version | `1` |
| 6 | `u16` | header size | `32` |
| 8 | `u32` | reserved | zero |
| 12 | `u16` | entry count | 0 through 32 |
| 14 | `u16` | reserved | zero |
| 16 | `u32` | payload size | `0x1000` through `0x400000` |
| 20 | `u32` | manifest CRC | manifest entries only |
| 24 | `u32` | payload CRC | bytes `[0x1000, payload_size)` |
| 28 | `u32` | header CRC | bytes `[0, 28)` |

An empty asset set is represented by a valid 4096-byte package with zero
manifest entries and a payload CRC for an empty byte range.

### Manifest entry

Each entry is exactly 64 bytes. This is where the format parts company with the
font package: a face describes its own geometry, a bitmap does not, so width,
height, colour format and stride are validated at commit rather than discovered
inside a draw.

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `char[32]` | image identifier | zero-terminated; at most 31 usable bytes |
| 32 | `u16` | width | 1 through 2048 |
| 34 | `u16` | height | 1 through 2048 |
| 36 | `u8` | colour format | `1` rgb565, `2` rgb565a8, `3` indexed8, `4` alpha8 |
| 37 | `u8` | reserved | zero |
| 38 | `u16` | stride | bytes per colour-plane row; must match width and format |
| 40 | `u32` | data offset | at least `0x1000`, 64-byte aligned |
| 44 | `u32` | data length | non-zero, within `payload_size`, and exactly the size the geometry implies |
| 48 | `u32` | asset CRC | exact image byte range |
| 52 | `u32` | palette offset | the data offset for `indexed8`, zero otherwise |
| 56 | `u16` | palette entry count | 1 through 256 for `indexed8`, zero otherwise |
| 58 | `u16` | reserved | zero |
| 60 | `u32` | reserved | zero |

Image identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or `-`,
and must be unique within a package — the same rule a font family follows, so an
identifier survives a round trip through JSON and a C string.

Pixel layout, which is LVGL's own:

| Format | Stride | Bytes |
| --- | --- | --- |
| `rgb565` | `width * 2` | colour plane |
| `rgb565a8` | `width * 2` | colour plane followed by an 8-bit alpha plane of stride `width` |
| `indexed8` | `width` | `palette_count * 4` palette bytes followed by one index per pixel |
| `alpha8` | `width` | one alpha byte per pixel |

## Validation and resolution

Firmware validates package structure, identifier syntax, size limits,
uniqueness, non-overlap, alignment, the pixel geometry, and every CRC before
committing the header. A configuration resolves against installed images: an
image that is not installed is a composition error and is never replaced with
another one. That check runs before a replacement configuration is applied, so a
document naming an absent image is rejected while the running dashboard is still
intact.

Indexed colour is part of the format and validated by the device, but the
configurator does not produce it yet.

## Serial upload protocol

The upload protocol shares the selected telemetry serial transport and reuses
the font upload's frames verbatim under the `@SC:IMAGE:` command namespace. Both
kinds share one binary session: the claim is taken on the task that reads the
bytes, inside the handler for the command that opens the session, so a second
`BEGIN` is answered `@SC:ERR:IMAGE:busy` rather than racing the first.

The host can query persisted asset state without starting an upload:

```text
@SC:IMAGE:INFO
@SC:OK:IMAGE:INFO:storage=1,package=1,format=1,images=2,size=397312,reboot_required=0,entries=logo:128x64:rgb565a8;shift_bar:320x24:rgb565
```

`storage` reports whether the partition is available. `package` reports whether
a valid package is stored. `format`, `images`, and `size` describe that package
and are zero when none is valid. `reboot_required` is set after a successful
commit until restart. `entries` is semicolon-separated, each entry being
`<id>:<width>x<height>:<format>`, and is empty for a package without images. The
geometry travels with the entry so the configurator can tell whether an
installed image still suits the dashboard without re-uploading to find out.

The host can erase the complete installed package outside an upload session:

```text
@SC:IMAGE:CLEAR
@SC:OK:IMAGE:CLEARED:reboot_required=1
```

Clear is rejected while an update is active or another image change is pending a
reboot. The active dashboard keeps drawing from its external-RAM copies until
the required reboot; after restart, configurations referencing cleared images
report unresolved dependencies.

The host starts a session with the complete package size:

```text
@SC:IMAGE:BEGIN:size=<bytes>
```

Firmware validates the size and erases the image partition in its own dedicated
static FreeRTOS task. When ready for binary data, it replies:

```text
@SC:OK:IMAGE:READY:max_chunk=1024
```

After this response, every host request is a binary frame. The host sends only
one frame at a time and waits for its response before sending the next one. The
frame layout is the `SCF1` frame defined in
[Font asset storage](font-assets.md), unchanged.

Each accepted data frame receives:

```text
@SC:OK:IMAGE:ACK:sequence=<sequence>,received=<total_bytes>
```

A frame with a bad CRC or unexpected sequence cancels the session, as do other
structural or storage errors. Errors use `@SC:ERR:IMAGE:<reason>` and return the
transport to normal line mode. Sending data before the previous response is a
protocol overrun and also cancels the session.

Commit is accepted only after exactly the declared package size has arrived.
Firmware validates the candidate, writes its header last, verifies the stored
package, and replies:

```text
@SC:OK:IMAGE:COMMITTED:reboot_required=1
```

Cancel replies with `@SC:OK:IMAGE:CANCELLED`. Ten seconds without a complete
request cancels an active session with `@SC:ERR:IMAGE:timeout`. During a
session, all received bytes belong to the image protocol; normal line commands
and telemetry input resume after commit, cancel, timeout, or error.

## Conversion

The configurator converts each selected PNG, JPEG or BMP to the chosen colour
format at the chosen width and height, and that is what the device stores and
draws. A widget resized in the editor does not resize the artwork; the image is
converted again instead. This is what keeps the ESP32-P4 accelerator engaged,
which refuses any transform, and what makes runtime rotation unnecessary to
support.

At most 32 images fit in one package, each at most 2048 pixels on a side, with
the package as a whole bounded by the 4 MiB partition.
