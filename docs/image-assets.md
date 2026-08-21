# Image asset storage

This document defines image asset package format version 2. It is the contract
between the configurator and the firmware image asset service. It is separate
from the device configuration schema and from configuration NVS.

A package carries images already in the pixel layout the display draws and at
the size the widget draws them at. The device holds no decoder and neither
scales nor rotates: conversion happens in the configurator
([ADR 0018](adr/0018-uploaded-image-assets.md)).

Those pixels are stored **deflated**. That is the one saving the device does not
pay for at runtime: each image is inflated once at startup, into the external RAM
it was going to be copied into anyway, and LVGL then draws from exactly the raw
bytes it would otherwise have had — same blit, same ESP32-P4 accelerator. So the
artwork's size lands on flash rather than on the frame. Real dashboard artwork
deflates to roughly a fifth to a third of its raw size, which is about what the
same picture costs as a PNG. `tinfl_decompress` is in ROM on both the ESP32-S3
and the ESP32-P4, so the decompressor itself costs no flash either.

Version 1 packages are still read. Nothing about their bytes changed meaning —
the compression field was reserved and required to be zero — so a board that
already holds one keeps drawing across a firmware update.

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
mapped read-only at startup and firmware copies the images into external RAM
before the dashboard is built, because the next `BEGIN` unmaps and erases the
partition unconditionally — a live LVGL descriptor pointing into that mapping
would dangle.

**Only the images the running configuration draws are copied.** A package holds
up to 32 and a dashboard draws at most eight, so reserving for the package would
be paying for pictures nothing shows. The set is rebuilt whenever the
configuration is replaced, between tearing the dashboard down and building the
next one — the only moment nothing is drawing from it — and the reservation only
ever grows, so a lighter document after a heavier one costs no allocation. An
image that is installed but not drawn stays in flash and costs no external RAM at
all.

This is why a document's images are checked against the **package first and what
is loaded second**: an image the current dashboard does not draw is installed and
simply absent from memory, while between an upload's `BEGIN` and the restart it
requires the partition is erased and the copies in RAM are the only ones left.
In that window nothing is reloaded at all — what the registry holds is kept and
composed from, so a configuration can still be applied before the restart.

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
| following | until `0x1000` | Reserved; ignored |
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
| 4 | `u16` | format version | `1` or `2`; the configurator writes `2` |
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
| 32 | `u16` | width | 1 through 2048; of **one frame** |
| 34 | `u16` | height | 1 through 2048; of **one frame** |
| 36 | `u8` | colour format | `1` rgb565, `2` rgb565a8, `4` alpha8 (`3` is reserved, see below) |
| 37 | `u8` | compression | `0` none, `1` raw deflate. Must be zero in a version 1 package |
| 38 | `u16` | stride | bytes per colour-plane row; must match width and format |
| 40 | `u32` | data offset | at least `0x1000`, 64-byte aligned |
| 44 | `u32` | data length | the **stored** size: non-zero, within `payload_size`, exactly the size the geometry implies when uncompressed and no larger than it when deflated |
| 48 | `u32` | asset CRC | the exact stored byte range, compressed or not |
| 52 | `u32` | palette offset | zero |
| 56 | `u16` | palette entry count | zero |
| 58 | `u16` | frame count | 1 through 64; `0` reads as 1. Must be zero in a version 1 package |
| 60 | `u32` | reserved | zero |

Length and CRC describe what is **stored**, so a corrupted transfer is caught
before anything is inflated; the geometry beside them describes what those bytes
become. Whether a deflate stream really produces that many bytes is the one rule
the manifest cannot check, so it is settled when the image is inflated at
startup, and an image that does not is a load failure like any other.

Image identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or `-`,
and must be unique within a package — the same rule a font family follows, so an
identifier survives a round trip through JSON and a C string.

Pixel layout once inflated, which is LVGL's own:

| Format | Stride | Bytes |
| --- | --- | --- |
| `rgb565` | `width * 2` | colour plane |
| `rgb565a8` | `width * 2` | colour plane followed by an 8-bit alpha plane of stride `width` |
| `alpha8` | `width` | one alpha byte per pixel |

An `alpha8` image carries coverage and no colour. The device paints it in the
widget's `recolor`, and in white when the widget authors none — see
[device-configuration.md](device-configuration.md).

### Sprite sheets

An entry holding more than one frame is a sprite sheet: several pictures of one
geometry, uploaded and addressed as a single image. A widget draws whichever
frame it is asked for — outright, or from telemetry — so a gear readout, a flag
or a lamp set is one widget rather than a stack of them, and one of the 32
entries rather than one per picture.

Frames are stored as **whole frames back to back**, not as the rows of one taller
picture. That is the only layout contiguous in every colour format: RGB565A8
keeps its alpha plane after the whole colour plane, so a row range of a taller
image would not be a frame in it. Storing whole frames means reaching frame `n`
is advancing the data pointer by one frame's bytes and nothing else — no offset
arithmetic inside LVGL, and the accelerated blit is untouched.

The whole entry is one deflate stream, every frame included, so compression and
sheets compose without either knowing about the other.

### Indexed colour is reserved, not supported

Colour format `3` is spoken for so it can never come to mean something else, and
refused by validation. LVGL cannot blend an indexed image: it expands one to
ARGB8888 a line at a time on **every repaint**, which also puts it outside the
ESP32-P4 accelerator's RGB565/RGB888 gate. It would have halved storage at the
cost of frames — and compressing the package halves storage at the cost of
nothing. LVGL also fixes an indexed palette at a full 256 entries regardless of
how many are used, which the variable `palette_entry_count` this format once
declared could not have expressed correctly.

## Validation and resolution

Firmware validates package structure, identifier syntax, size limits,
uniqueness, non-overlap, alignment, the pixel geometry, the compression field,
and every CRC before committing the header. A configuration resolves against installed images: an
image that is not installed is a composition error and is never replaced with
another one. That check runs before a replacement configuration is applied, so a
document naming an absent image is rejected while the running dashboard is still
intact.

## Serial upload protocol

The upload protocol shares the selected telemetry serial transport and reuses
the font upload's frames verbatim under the `@SC:IMAGE:` command namespace. All
three uploaded kinds — fonts, images and firmware
([Firmware updates over serial](ota.md)) — share one binary session: the claim is
taken on the task that reads the bytes, inside the handler for the command that
opens the session, so a second upload cannot race the first. On the link the
upload owns there are no more commands until it ends — a `BEGIN` sent there
mid-upload is a bad frame and ends the running upload with `invalid_frame`. A
`BEGIN`, `INFO` or `CLEAR` arriving on another link while an upload runs is
answered `@SC:ERR:IMAGE:busy` (or `@SC:ERR:FONT:busy`, or `@SC:ERR:FW:busy`),
whichever kind owns the stream.

The host can query persisted asset state without starting an upload:

```text
@SC:IMAGE:INFO
@SC:OK:IMAGE:INFO:storage=1,package=1,format=1,images=2,size=397312,reboot_required=0,entries=logo:128x64:rgb565a8;shift_bar:320x24:rgb565
```

`storage` reports whether the partition is available. `package` reports whether
a valid package is stored. `format`, `images`, and `size` describe that package
and are zero when none is valid. `reboot_required` is set after a successful
commit until restart. `entries` is semicolon-separated, each entry being
`<id>:<width>x<height>:<format>`, with `:<frames>` appended when the image is a
sprite sheet; it is empty for a package without images. The
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
format at the chosen width and height, deflates the result, and that is what the
device stores; what it draws is those bytes inflated back. A widget resized in
the editor does not resize the artwork; the image is converted again instead.
This is what keeps the ESP32-P4 accelerator engaged, which refuses any
transform, and what makes runtime rotation unnecessary to support.

Deflate is skipped for an image that does not get smaller — artwork that is
already noise can compress to more than it started as, and there is no reason to
make the board inflate it to find that out. The compression field says which
happened, per image.

The colour format is offered from what the artwork actually uses rather than from
what its file can carry: a PNG almost always has an alpha channel, and one that is
opaque everywhere needs no alpha plane on the device. Dropping it saves a third of
the image in flash **and** in external RAM with nothing about the picture changed,
so a source with no transparent pixel is offered `rgb565` rather than `rgb565a8`.
It is a default, not a rule — the format stays the author's to set.

At most 32 images fit in one package, each at most 2048 pixels on a side and at
most 64 frames, with the package as a whole bounded by the 4 MiB partition. A
sheet's frames are all converted to one geometry, since that geometry is what the
device steps through them by. Two sizes matter and they
are no longer the same one: the **stored** size is what fills that partition,
and the **decoded** size — `width × height` by the format's bytes per pixel — is
what the board reserves in external RAM. The editor's estimate is the decoded
size, because it is the one that can be known before converting, and it bounds
the other.
