# Font asset storage

This document defines font asset package format version 1. It is the contract
between the future configurator converter and the firmware font asset service.
It is separate from device configuration schema 2 and from configuration NVS.

## Storage model

Firmware reserves two raw 2 MiB data partitions named `font_a` and `font_b`.
At startup it validates both slots and selects the valid slot with the greatest
generation. If neither slot is valid, the dashboard uses only compiled LVGL
Montserrat.

An update always erases and writes the inactive slot. Bytes after the 32-byte
header are written first; the header is kept in RAM, and is written only after
the complete candidate package passes validation. The previous active slot is
never modified. A successfully committed slot becomes active after reboot so
that existing LVGL font objects and memory mappings remain valid for the whole
runtime.

After a successful commit, the service rejects another update until reboot.
This prevents a second request from erasing the newly committed inactive slot
before it has become the runtime's selected active slot.

The active slot is mapped read-only from flash. Font byte ranges are passed
directly to the LVGL binary font loader; firmware does not copy a complete font
asset into DRAM or PSRAM. LVGL may allocate its own bounded runtime metadata
when a font is opened.

## Integer and checksum encoding

All multi-byte integers are unsigned little-endian values. Reserved fields must
be zero. CRC fields use standard CRC-32/ISO-HDLC (`0xEDB88320` reflected
polynomial, initial value `0xFFFFFFFF`, final XOR `0xFFFFFFFF`).

## Package layout

| Offset | Size | Field |
| ---: | ---: | --- |
| `0x0000` | 32 | Header |
| `0x0020` | `entry_count * 48` | Manifest entries |
| following | until `0x1000` | Reserved; ignored by version 1 |
| `0x1000` | variable | Aligned LVGL binary font data |

`payload_size` is the exact package size and may not exceed 2 MiB. Every asset
range must be fully contained in `[0x1000, payload_size)`. Asset offsets are
four-byte aligned. Asset ranges must not overlap.

### Header

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `u32` | magic | bytes `SCFA` |
| 4 | `u16` | format version | `1` |
| 6 | `u16` | header size | `32` |
| 8 | `u32` | generation | non-zero, exactly previous generation + 1 for an update |
| 12 | `u16` | entry count | 0 through 32 |
| 14 | `u16` | reserved | zero |
| 16 | `u32` | payload size | `0x1000` through `0x200000` |
| 20 | `u32` | manifest CRC | manifest entries only |
| 24 | `u32` | payload CRC | bytes `[0x1000, payload_size)` |
| 28 | `u32` | header CRC | bytes `[0, 28)` |

An empty asset set is represented by a valid 4096-byte package with zero
manifest entries and a payload CRC for an empty byte range.

### Manifest entry

Each entry is exactly 48 bytes.

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `char[32]` | family identifier | zero-terminated or fills all 31 usable bytes followed by zero |
| 32 | `u16` | pixel size | 1 through 255 |
| 34 | `u16` | reserved | zero |
| 36 | `u32` | data offset | at least `0x1000`, four-byte aligned |
| 40 | `u32` | data length | non-zero and within `payload_size` |
| 44 | `u32` | asset CRC | exact font byte range |

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`. The pair `family + pixel size` must be unique within a package. Each asset
must be an LVGL binary font accepted by the firmware's LVGL version.

## Validation and fallback

Firmware validates package structure, identifier syntax, size limits,
uniqueness, non-overlap, and all CRC values before committing a new header. At
startup, a structurally valid slot can still contain a font that the LVGL
loader rejects. That individual asset is skipped and matching widgets use the
nearest compiled Montserrat size (10, 24, or 48 px).

The storage and runtime registry are implemented. Transport commands for
uploading a package and configurator-side TTF/OTF conversion are intentionally
outside this phase.
