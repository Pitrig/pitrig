# ADR 0010: Uploaded Font Assets

Status: Accepted; revised to store font faces and rasterize sizes on the device

## Context

Dashboard fonts were compiled into the firmware as generated C sources. Every
new family or size therefore increased the application image and required a
firmware rebuild and reflash. This does not fit a configurator-first workflow
where fonts are project assets selected by the user.

Font data can be much larger than runtime configuration. It must not be placed
inside the sparse JSON payload or the configuration NVS records. The upload
path must detect incomplete or corrupt packages even though the MVP does not
retain a second copy for rollback.

## Decision

Replace the closed compiled-font enumeration with a stable bounded font family
identifier and pixel size. The public configuration schema stores a font as:

```json
{
  "family": "roboto-black",
  "size_px": 48
}
```

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`. Font sizes are integers from 1 through 255 pixels. Production firmware
exposes no built-in dashboard font family. Family resolution is exact: a
missing family is an explicit dashboard composition error and is not silently
replaced with another font. Debug builds may retain private framework fonts for
service UI, but the dashboard registry never resolves them by public family
identifier.

The configurator uploads the imported TTF or OTF face unchanged, one per
family, and the device rasterizes every pixel size a configuration asks for.
A device asset is keyed by family alone; editor display names and source
metadata remain project-only data. Storing faces rather than converted bitmaps
removes the conversion step, makes a size change a configuration change instead
of an upload, and stops the device from holding glyphs it never draws — a
192 px family converted for every printable character is close to a megabyte of
which a dashboard uses a dozen glyphs.

A package holds at most 8 families, and a configuration may name no more than
that. Pixel sizes are unbounded by storage because they cost nothing there;
each family and size a configuration references becomes one runtime font
object.

Font assets live outside the application image and configuration NVS in one raw
2 MiB `font_assets` partition. The package contains a bounded manifest followed
by face data. The manifest owns a format version, bounded entry count, and for
every entry its family identifier, offset, length, and CRC32. Package-level
validation covers the complete stored asset set and includes an sfnt signature
check, because a face is parsed while rendering rather than at load.

An upload erases and replaces the single partition. Bytes after the header are
written first; firmware validates every bound and checksum before writing the
header last. An interrupted upload therefore leaves an invalid package rather
than a partially committed one, but the previous package is not recoverable.
The new package becomes active only after reboot. At startup the package is
memory-mapped read-only and every face is copied into external RAM before any
font is created. The rasterizer re-reads the face on each glyph cache miss, so
that copy is what keeps live fonts valid when a later upload releases the
mapping while the dashboard is still rendering.

Each runtime font owns a bounded cache of rendered glyphs. Those glyph bitmaps
are allocated through LVGL's font draw-buffer handlers, which the platform
points at external RAM: the ESP-IDF allocator keeps blocks below its internal
threshold in internal memory, and a single 192 px glyph sits just under it.
Fonts are created without kerning so a cached advance width does not depend on
the neighbouring glyph, which is what allows dashboard composition to pre-warm
each font one glyph at a time — the digits and separators the runtime emits
plus the characters the configuration itself supplies. A character outside that
set is rasterized when first drawn.

Asset upload uses a dedicated bounded, stop-and-wait protocol over the selected
serial transport, separate from configuration `SET`. Binary frames carry an
explicit type, sequence, bounded payload length, and CRC32. Flash erase and
write operations run in a dedicated static task rather than the transport RX
task. A separate `FONT:INFO` query exposes storage and package availability,
format version, the installed family catalog, package size, and pending-reboot
state.
The bounded `FONT:CLEAR` command erases the complete package and requires a
reboot; individual assets are not deleted independently.
Configuration may reference a family that is not installed, but dashboard
composition reports that unresolved dependency instead of substituting another
font. A pixel size is never an unresolved dependency: it is rasterized on
demand.

Schema 1 persisted configuration is not migrated because its closed `lcd` and
`roboto_mono` identifiers refer to fonts that no longer exist. Firmware falls
back to a valid schema 2 slot or the board-only factory configuration.

## Consequences

- Adding a custom font will not require rebuilding or reflashing firmware.
- Production firmware keeps no dashboard font family in its application image.
  Diagnostic-only framework fonts are not part of the public resolver.
- Persisted font bytes consume dedicated flash rather than configuration NVS or
  the application image, and hold one face per family instead of one bitmap set
  per family and size.
- Changing a font size needs neither an upload nor a reboot. Adding a family
  needs both.
- Rasterization moves to runtime. Composition pre-warms the glyphs a dashboard
  draws, so periodic frames hit the cache; an unwarmed character costs one
  longer frame.
- A malformed face is rejected at commit by the signature check and, failing
  that, when its font is created during composition — not inside a frame.
- Replacing a package requires a reboot before the new faces are used.
- An interrupted update can remove the previous package; there is no second
  slot or rollback generation.
- The configurator must retain source fonts in its local project and upload the
  complete family set before expecting custom rendering.
- The configurator derives the target package from configuration dependencies,
  asks for one source per family, uploads the complete package, and only then
  saves the configuration. It no longer carries a font converter.
- Every device connection performs a fresh configuration and font manifest
  probe. Reconnecting clears transient validation and upload feedback before
  the configurator evaluates the newly reported device state.
- Firmware still validates identifier syntax, sizes, manifest bounds, and
  checksums; configurator validation does not replace the device trust
  boundary.
- The single partition, bounded asset service, read-only flash mapping, and
  LVGL font registry are implemented. The exact package contract is
  documented in [Font asset storage](../font-assets.md).
- The firmware binary upload protocol and the configurator-side upload
  orchestration are implemented. Project persistence and editor integration
  remain separate phases.
- Package format 3 is not backward compatible and installed format 2 packages
  read as absent, so firmware and configurator must ship together and existing
  devices need one re-upload.
- Text metrics come from the face rather than from a converter, so a dashboard
  authored against the previous packages can shift by a pixel or two.

## Amendment: the binary stream is shared

Uploaded images arrived with ADR 0018 and use the same `SCF1` frames over an
`@SC:IMAGE:` namespace. One serial link cannot carry two binary sessions, so the
font control no longer decides for itself whether it owns the byte stream: it
takes a claim, synchronously on the task that reads the bytes, inside its
`BEGIN` handler, and answers `busy` when another kind holds it. Storage moved to
the shared `asset_storage` contract at the same time; the font package format
and everything above it are unchanged.
