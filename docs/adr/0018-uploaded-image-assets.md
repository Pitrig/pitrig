# ADR 0018: Uploaded Image Assets

Status: Accepted

## Context

Reference dashboards lean on artwork: shift-light strips, brand marks, gauge
faces, backgrounds. The firmware had no way to carry any of it. Compiling
images into the app image would repeat the problem ADR 0010 solved for fonts —
a new logo would mean a new firmware — so images have to be uploaded the way
faces are.

They are not faces, though. A face is small, self-describing and rasterised on
demand; a bitmap is large, describes nothing about itself, and is drawn as-is.
That difference decides most of what follows.

## Decision

**Conversion happens in the configurator; the device never decodes.** The
configurator converts PNG, JPEG or BMP into the LVGL layout the display draws —
RGB565, RGB565A8 or A8 — at the size the widget uses. ADR 0010 deliberately
went the other way for fonts, uploading the original file so any pixel size
could be rasterised later; the asymmetry is real and worth stating. A face is a
few hundred kilobytes that serves every size, while an image serves one size
and dwarfs the code that would decode it. Decoding on the board would cost
flash for the decoder, a decode buffer in external RAM, and time inside a
frame; scaling there would also drop the ESP32-P4 off its accelerated path,
which refuses any transform. So the pixels arrive ready to draw.

**One 4 MiB `image_assets` partition at `0x450000`**, immediately after
`font_assets`, so nothing already installed moves. A full-screen 1024×600
RGB565A8 background is 1.8 MiB, which is why 2 MiB would have been tight. That
leaves 7.6 MiB of the 16 MiB flash unallocated, reserved for the Phase 6 OTA
layout — a dual-OTA arrangement at the current app size needs about 4 MiB, so
the remaining space is deliberate rather than incidental.

**The `SCIA` package mirrors `SCFA` where it can and diverges where it must.**
The 32-byte header is byte-for-byte identical — magic, format, entry count,
payload size, three CRC32s, header written last — because the risky part of an
upload is the flash choreography, not the pixels, and that choreography is
already proven. The manifest entry is 64 bytes rather than 48, carrying width,
height, colour format, stride and an optional palette: a bitmap does not
describe itself, so the geometry is validated at commit instead of being
discovered inside a draw. Data is 64-byte aligned, matching the cache line and
the P4's draw-buffer alignment.

**Storage is shared, formats are not.** `services/asset_storage` owns the
`IStorage` contract and `platform/partition_asset_storage` implements it for a
named partition of a given size, so a second asset kind is a second instance
rather than a second class. The package parsers stay separate: 48-byte versus
64-byte entries and sfnt-signature versus pixel-geometry validation would make
a shared parser harder to read than two straight ones.

**The binary stream has one owner, decided by a claim.** The frames (`SCF1`),
the 1024-byte payloads, the stop-and-wait acknowledgement and the 10-second
inactivity timeout are reused verbatim under an `@SC:IMAGE:` command namespace.
What could not be reused is how the router decided where bytes went: it asked
the font control whether it was active, and with two upload kinds that races —
the flag is set while the worker task is still erasing. `services/binary_session`
now holds a `Claim`, taken with a compare-and-swap **on the task that reads the
bytes, inside the handler for the command that opens a session**. A second
`BEGIN` finds the stream owned and is answered `busy`. The router no longer
knows what a font or an image is: a session registers a command prefix and two
callbacks, so a third asset kind is a registration rather than a branch.

**Images are copied into external RAM at boot**, like faces. Drawing straight
from the flash mapping is DMA-safe on all three boards — the P4's PPA restricts
only its output buffer, and the boot splash already draws from flash — but
`begin_update` unconditionally unmaps and erases, so an upload would dangle
every live descriptor into a partition mid-erase. The copy removes that class
of bug with no new cross-layer plumbing, and it costs what was actually
uploaded rather than the partition size. Mmap-direct remains available if PSRAM
pressure ever argues for it; it would need a teardown upcall before
`begin_update`.

**A missing image is a composition error, never a substitution.** `images_available`
is checked before a replacement configuration is applied, beside the same check
for fonts, so a document naming an image the board does not hold is rejected
while the running dashboard is still intact.

## Consequences

- A new image needs an upload and a restart, not a new firmware.
- The device holds no decoder, so a format it cannot draw cannot be uploaded:
  the configurator is where "what the display can show" is decided.
- An image is drawn at the size it was uploaded at. Resizing a widget does not
  resize the artwork; the configurator re-converts instead. This is what keeps
  the P4 accelerator engaged and what makes rotation unnecessary to support.
- Indexed colour is in the format and validated by the device, but the
  configurator does not produce it yet — a palette needs quantisation worth
  doing properly rather than approximately.
- Only one upload can run at a time across every asset kind, and the second one
  is told so rather than corrupting the first.
- The performance overlay reports one upload-task line for both controls, since
  only one of them can be working.
- The converted pixels are unreachable once uploaded — the device sends nothing
  back and the picked source is gone with the session — so the configurator
  keeps its own copy of them for the editor's preview, under the asset cache
  decided in
  [ADR 0010](0010-uploaded-font-assets.md#amendment-the-configurator-keeps-a-copy-of-what-it-installs).
  The preview draws the converted image, so RGB565 banding shows there rather
  than first on the board.
