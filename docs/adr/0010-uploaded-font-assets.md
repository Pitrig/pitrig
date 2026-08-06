# ADR 0010: Uploaded Font Assets

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
identifier and pixel size. Public configuration schema 2 stores a font as:

```json
{
  "family": "roboto-black",
  "size_px": 48
}
```

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`. Font sizes are integers from 1 through 255 pixels. Production firmware
exposes no built-in dashboard font family. Resolution is exact: a missing
family/size is an explicit dashboard composition error and is not silently
replaced with another font. Debug or display-diagnostics builds may retain
private framework fonts for service UI, but the dashboard registry never
resolves them by public family identifier.

The configurator will convert imported TTF or OTF sources into LVGL binary font
assets. Original font files never reach the device. Each device asset is keyed
by `family + size_px`; editor display names and original source metadata remain
project-only data.

Font assets live outside the application image and configuration NVS in one raw
2 MiB `font_assets` partition. The package contains a bounded manifest followed
by font data. The manifest owns a format version, bounded entry count, and for
every entry its family identifier, pixel size, offset, length, and CRC32.
Package-level validation covers the complete stored asset set.

An upload erases and replaces the single partition. Bytes after the header are
written first; firmware validates every bound and checksum before writing the
header last. An interrupted upload therefore leaves an invalid package rather
than a partially committed one, but the previous package is not recoverable.
The new package becomes active only after reboot. At startup the package is
memory-mapped read-only and exposed to LVGL's binary font loader. The current
LVGL loader materializes the opened font's glyph metadata and bitmap data in
the LVGL heap, so the mapping can be released before a later upload without
invalidating active LVGL font objects. LVGL uses the system C allocator rather
than its fixed 64 KiB built-in pool. ESP-IDF routes allocations of at least
16 KiB to PSRAM while reserving internal memory for DMA and other constrained
users; this lets bounded large font bitmaps load without consuming the internal
heap or entering LVGL's allocation assertion.

Asset upload uses a dedicated bounded, stop-and-wait protocol over the selected
serial transport, separate from configuration `SET`. Binary frames carry an
explicit type, sequence, bounded payload length, and CRC32. Flash erase and
write operations run in a dedicated static task rather than the transport RX
task. A separate `FONT:INFO` query exposes storage and package availability,
format version, the exact `family + size_px` asset catalog, package size, and
pending-reboot state.
Configuration may reference a syntactically valid font that is not installed,
but dashboard composition reports that unresolved dependency instead of
substituting another font.

Schema 1 persisted configuration is not migrated because its closed `lcd` and
`roboto_mono` identifiers refer to fonts that no longer exist. Firmware falls
back to a valid schema 2 slot or the board-only factory configuration.

## Consequences

- Adding a custom font will not require rebuilding or reflashing firmware.
- Production firmware keeps no dashboard font family in its application image.
  Diagnostic-only framework fonts are not part of the public resolver.
- Persisted font bytes consume dedicated flash rather than configuration NVS or
  the application image. The current LVGL loader still allocates runtime font
  data when an uploaded font is opened; large allocations use PSRAM through the
  ESP-IDF system allocator.
- Replacing a package requires a reboot before the new assets are used.
- An interrupted update can remove the previous package; there is no second
  slot or rollback generation.
- The configurator must retain source fonts in its local project and upload a
  complete converted asset set before expecting custom rendering.
- The configurator derives the target package from configuration dependencies,
  asks for one source per family, generates every required size, uploads the
  complete package, and only then saves the configuration.
- Every device connection performs a fresh configuration and font manifest
  probe. Reconnecting clears transient validation and upload feedback before
  the configurator evaluates the newly reported device state.
- Firmware still validates identifier syntax, sizes, manifest bounds, and
  checksums; configurator validation does not replace the device trust
  boundary.
- The single partition, bounded asset service, read-only flash mapping, and
  LVGL font registry are implemented. The exact package contract is
  documented in [Font asset storage](../font-assets.md).
- The firmware binary upload protocol and the configurator-side MVP conversion
  and upload orchestration are implemented. Project persistence, broader glyph
  selection, and editor integration remain separate phases.
