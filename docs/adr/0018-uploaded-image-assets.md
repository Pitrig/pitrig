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

**One 4 MiB `image_assets` partition**, immediately after `font_assets`, so
nothing already installed moves. A full-screen 1024×600 RGB565A8 background is
1.8 MiB, which is why 2 MiB would have been tight. That left 7.6 MiB of the
16 MiB flash unallocated, reserved for the Phase 6 OTA layout — a dual-OTA
arrangement at the current app size needs about 4 MiB, so the remaining space
was deliberate rather than incidental. [ADR 0022](0022-over-the-air-firmware-updates.md)
spent it, moved this partition in the process, and later grew it to 7 MiB when
the rest of the tail was allocated; the current offsets are in
[ota.md](../ota.md).

**The `SCIA` package mirrors `SCFA` where it can and diverges where it must.**
The 32-byte header is byte-for-byte identical — magic, format, entry count,
payload size, three CRC32s, header written last — because the risky part of an
upload is the flash choreography, not the pixels, and that choreography is
already proven. The manifest entry is 64 bytes rather than 48, carrying width,
height, colour format, stride and how the bytes are stored: a bitmap does not
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

## Shared upload engine

The `SCF1` framing, the stop-and-wait sequence, the CRC, the inactivity timeout,
the worker task and the `binary_session` claim are identical for every uploaded
asset kind, so they live once in `services/asset_control`. A kind supplies its
protocol tag, its task identity, an `Operations` table over its own service, and
the body of its `INFO` reply; nothing else about the transfer is per-kind. The
engine is plain data rather than a template, so the binary carries one copy of
the state machine.

The package format is shared on the same terms. Both kinds write the same
32-byte header and commit it the same way, so `services/asset_package` holds
that header, its validation, and the update status and error types. A kind keeps
its magic and version, its manifest entry decoder, and its catalog — a font face
describes itself and a bitmap does not, which is the whole of the difference.

## Consequences

- A new image needs an upload and a restart, not a new firmware.
- The device holds no decoder, so a format it cannot draw cannot be uploaded:
  the configurator is where "what the display can show" is decided.
- An image is drawn at the size it was uploaded at. Resizing a widget does not
  resize the artwork; the configurator re-converts instead. This is what keeps
  the P4 accelerator engaged and what makes rotation unnecessary to support.
- Stored pixels are deflated, and the artwork's size lands on flash rather than
  on the frame — see the amendment below.
- Indexed colour is reserved rather than supported, for the reasons in that
  amendment.
- Only one upload can run at a time across every asset kind, and the second one
  is told so rather than corrupting the first.
- The performance overlay reports one upload-task line for both controls, since
  only one of them can be working.
- The converted pixels are unreachable once uploaded — the device sends nothing
  back and the picked source is gone with the session — so the configurator
  keeps its own copy of them for the editor's preview, under the asset cache
  decided in
  [the amendment below](#amendment-the-configurator-keeps-a-copy-of-the-images-it-installs).
  The preview draws the converted image, so RGB565 banding shows there rather
  than first on the board.

## Amendment: the package is compressed, and indexed colour is not the answer

Raw pixels cost what they cost: a 325 KB PNG lands as 1.5 MiB, because 1.5 MiB
is what `width × height × 2` comes to and nothing about the artwork's redundancy
survives the conversion. The obvious answers were all measured before one was
taken.

| Approach | Flash | External RAM | CPU per repaint | P4 accelerator |
| --- | ---: | ---: | --- | :-: |
| Raw RGB565, as first decided | `w·h·2` | `w·h·2` | none, direct blit | yes |
| `indexed8` | `w·h + 1 KiB` | same | I8 → ARGB8888 per line, every repaint | no |
| PNG / JPEG / SVG through LVGL | ~compressed | decode buffer | **full decode every draw** | no |
| the same, with LVGL's image cache on | ~compressed | `w·h·4` (ARGB8888) | none after the first | no |
| **Deflate in the package, inflated at boot** | **~compressed** | `w·h·2`, unchanged | **none** | **yes** |

Three facts decide it. `CONFIG_LV_CACHE_DEF_SIZE` is `0` on every board, so LVGL
caches no decoded image and anything decoder-shaped pays its full cost on every
redraw. Turning that cache on does not rescue it: a decoded PNG or indexed image
is held as ARGB8888, **double** what RGB565 costs today. And the ESP32-P4's PPA
accepts only RGB888 and RGB565 source formats, so every one of those options
loses hardware acceleration as well.

So the compression belongs in our own package rather than in a decoder LVGL
runs: deflate at build time, inflate once during startup into the external RAM
the image was going to be copied into anyway. Flash falls to about what the same
picture costs as a PNG — measured at a fifth to a third of raw on real dashboard
artwork — while external RAM, the draw path and the accelerator are all exactly
what they were. `tinfl_decompress` is in ROM on both the ESP32-S3 and the
ESP32-P4, so the decompressor costs no flash either.

**Indexed colour is therefore reserved rather than supported.** It was the one
option that saved external RAM as well, but the saving is on a resource these
boards have 8 MiB or more of, and it is bought with per-repaint CPU and the
accelerator. It was also unimplementable as this ADR first specified it: LVGL
fixes an indexed palette at a full 256 entries whatever the count says, so the
variable `palette_entry_count` in the original manifest entry would have put the
pixel data at the wrong offset. The colour-format value stays spoken for so it
can never come to mean something else.

The package format goes to version 2, using a byte the entry already reserved.
Version 1 stays readable: nothing about its bytes changed meaning, so a board
holding one keeps drawing across a firmware update.

**What this does not solve** is portability. A compressed bitmap is still a
bitmap at one size, so a cross-board layout transfer still cannot carry it. That
remains what an original-format asset would be for, and it remains open.

## Amendment: sprite sheets are uniform frames, stored whole

One entry may hold several pictures of one geometry, and a widget draws whichever
of them it is asked for — outright through `sprite_frame`, or from telemetry
through `sprite_frame_source` (schema 12). A gear readout, a flag or a lamp set
becomes one widget rather than a stack of them, and one of the 32 package entries
rather than one per picture.

The frames are **uniform and stored whole, back to back**, rather than being
rectangles packed into a larger atlas. That is not a packing convenience: whole
frames are the only layout contiguous in *every* colour format this package
carries. RGB565A8 keeps its alpha plane after the whole colour plane, so a row
range of one taller image is not a frame in it, and an arbitrary rectangle is not
a contiguous run in any of them. Storing whole frames makes reaching frame `n` an
advance of the data pointer by one frame's bytes — a widget owns its own
`lv_image_dsc_t` and moves it — with no offset arithmetic inside LVGL, no clip,
and the ESP32-P4 accelerator untouched. Two widgets can therefore sit on
different frames of one sheet at no cost, which is why the image registry hands
out a sheet rather than a descriptor.

The cost is that a sheet cannot pack pictures of different sizes. For what sheets
are for — one picture per state of one readout — identical size is what is wanted
anyway.

A frame past what the sheet holds is a composition error, refused before a
replacement configuration is applied, exactly as naming an image that is not
installed is. This makes `sprite_frame` the one widget property whose valid range
comes from an uploaded asset rather than from the contract, so the editor can only
offer the range while a board is connected.

## Amendment: external RAM holds what is drawn, not what is installed

Compression put the artwork's size on flash, where there are four megabytes.
What it could not touch is external RAM: a compressed image has to be inflated to
be drawn, so it costs its full decoded size there whatever it costs in flash.
Two changes take that down without touching a single pixel of anyone's artwork.

**Only the images the running configuration draws are loaded.** The registry used
to copy every image in the package — up to 32 — while a dashboard draws at most
eight, so a library of icons was held whole to show three of them. The set is now
derived from the document and rebuilt on every replacement, between
`dashboard_composition::destroy` and `create`, which is the only moment nothing
holds a descriptor into it. The reservation grows and never shrinks, so repeated
applies converge on a high-water mark instead of trading large blocks back and
forth and fragmenting external RAM.

This moves one check: whether a document's images are *available* is now asked of
the package rather than of the registry, because an image the current dashboard
does not draw is installed and simply not in memory. A separate question — is
every image this document needs already loaded — is what now gates the
incremental apply path, since rebuilding the table is safe only with the
dashboard down.

**The alpha plane is offered only to artwork that uses one.** A PNG almost always
carries an alpha channel whether or not any pixel is transparent, and RGB565A8
keeps that plane beside the colour: a third of the image, in flash and in
external RAM alike, spent on a plane of `0xFF`. The configurator already decodes
each picked file for its thumbnail, so it scans it once and defaults the format
to `rgb565` when nothing is transparent. Noticing the alpha was never used is not
changing the picture, and it is the only saving that halves both memories at
once. It remains a default the author can override.

**What was considered and not taken:** drawing straight from the flash mapping,
which would cost zero external RAM. It is real on the ESP32-S3, whose renderer
reads pixels with the CPU, but it forces those images to be stored uncompressed —
trading all of the flash saving back — and it does not work on the ESP32-P4 at
all, where the PPA is a DMA engine that cannot address a flash mmap window. It
would also mean tearing the dashboard down before an upload rather than after.
Left open.

## Amendment: the configurator keeps a copy of the images it installs

An uploaded image is converted before it is sent and the converted pixels exist
nowhere else: the device holds no decoder and hands nothing back, and the picked
source file is a path held in memory for the length of one session. Without a
copy the canvas would fall back to a named box for the rest of the project's
life.

**Decision.** The configurator writes each image it installs to a cache under
the app's `userData` directory, re-encoded from the *converted* pixels so the
preview carries the resize and the colour reduction the upload applied. Faces
are deliberately not cached: the font library of
[ADR 0010](0010-uploaded-font-assets.md) owns them and answers whether or not a
board was ever given them.

The cache mirrors a device package rather than anything the author wrote, so:

- it is replaced whole on upload and emptied on clear, exactly as the package
  it stands for;
- nothing depends on it. A missing, stale or unreadable entry costs the preview
  its fidelity and falls back to the named image box — never the upload, the
  document, or validation;
- it stays out of the saved project. A project is a sparse configuration
  document, and binding megabytes of asset to it is a separate decision about
  the project format that this does not take.

**Consequences.**

- An image drawn on the canvas is the bitmap the board holds, but only for one
  installed by *this* installation; someone else's project draws a named box
  until its images are uploaded here.
- Glyph rasterization still differs: the browser and LVGL's TinyTTF hint and
  antialias differently, so the preview matches the board's layout, not its
  pixels.
