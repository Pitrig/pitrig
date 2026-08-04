# ADR 0010: Uploaded Font Assets

## Context

Dashboard fonts were compiled into the firmware as generated C sources. Every
new family or size therefore increased the application image and required a
firmware rebuild and reflash. This does not fit a configurator-first workflow
where fonts are project assets selected by the user.

Font data can be much larger than runtime configuration. It must not be placed
inside the sparse JSON payload or the configuration NVS records. The upload
path also has to tolerate interruption without destroying the last usable asset
set.

## Decision

Replace the closed compiled-font enumeration with a stable bounded font family
identifier and pixel size. Public configuration schema 2 stores a font as:

```json
{
  "family": "montserrat",
  "size_px": 48
}
```

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`. Font sizes are integers from 1 through 255 pixels. The only firmware-built
family is LVGL Montserrat. Its public resolver exposes 10, 24, and 48 pixels;
LVGL retains Montserrat 14 as its framework default. A missing family/size uses
the nearest public Montserrat size so an unavailable optional asset cannot
prevent the device from rendering.

The configurator will convert imported TTF or OTF sources into LVGL binary font
assets. Original font files never reach the device. Each device asset is keyed
by `family + size_px`; editor display names and original source metadata remain
project-only data.

Font assets will live outside the application image and configuration NVS in
two raw 2 MiB slots. Each complete slot contains a bounded manifest followed by
font data. The manifest owns a format version, generation, bounded entry count,
and for every entry its family identifier, pixel size, offset, length, and
CRC32. Slot-level validation covers the complete committed asset set.

Uploads target the inactive slot. Firmware erases and writes that slot,
validates every bound and checksum, then marks the new generation active. An
interrupted or invalid upload leaves the previous slot active. The active slot
will be memory-mapped read-only and exposed to LVGL's binary font loader; font
bytes are not copied into DRAM or PSRAM as a complete asset.

Asset upload is a dedicated bounded protocol, separate from configuration
`SET`. Configuration may reference a syntactically valid font that is not
installed; the renderer uses the Montserrat fallback until the matching asset
is available. This keeps configuration and asset updates independently
recoverable.

Schema 1 persisted configuration is not migrated because its closed `lcd` and
`roboto_mono` identifiers refer to fonts that no longer exist. Firmware falls
back to a valid schema 2 slot or the board-only factory configuration.

## Consequences

- Adding a custom font will not require rebuilding or reflashing firmware.
- Firmware keeps only Montserrat in its application image.
- Large font bytes consume dedicated flash rather than configuration NVS,
  internal DRAM, or PSRAM.
- The configurator must retain source fonts in its local project and upload a
  complete converted asset set before expecting custom rendering.
- Firmware still validates identifier syntax, sizes, manifest bounds, and
  checksums; configurator validation does not replace the device trust
  boundary.
- Physical partitions, the asset registry, binary upload commands, and
  configurator conversion are implemented in later approved phases.
