# Font asset storage

This document defines font asset package format version 2. It is the contract
between the configurator converter and the firmware font asset service. It is
separate from device configuration schema 2 and from configuration NVS.

## Storage model

Firmware reserves one raw 2 MiB data partition named `font_assets`. At startup
it validates the stored package. If the package is absent or invalid, no
dashboard fonts are available.

An update erases and replaces the complete partition. Bytes after the 32-byte
header are written first. The header stays in RAM and is written only after the
complete candidate package passes validation. An interrupted upload therefore
leaves an invalid package, but there is no second slot or previous generation
to recover.

A successfully committed package becomes active after reboot. The package is
mapped read-only at startup and its font byte ranges are passed to the LVGL
binary font loader. The current `lv_binfont_create_from_buffer` implementation
materializes glyph metadata and bitmap data in the LVGL heap, so the flash
mapping can be released before a later upload without invalidating the active
runtime font objects.

After a successful commit, the service rejects another update until reboot.

## Integer and checksum encoding

All multi-byte integers are unsigned little-endian values. Reserved fields must
be zero. CRC fields use standard CRC-32/ISO-HDLC (`0xEDB88320` reflected
polynomial, initial value `0xFFFFFFFF`, final XOR `0xFFFFFFFF`).

## Package layout

| Offset | Size | Field |
| ---: | ---: | --- |
| `0x0000` | 32 | Header |
| `0x0020` | `entry_count * 48` | Manifest entries |
| following | until `0x1000` | Reserved; ignored by version 2 |
| `0x1000` | variable | Aligned LVGL binary font data |

`payload_size` is the exact package size and may not exceed 2 MiB. Every asset
range must be fully contained in `[0x1000, payload_size)`. Asset offsets are
four-byte aligned and must not overlap.

### Header

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `u32` | magic | bytes `SCFA` |
| 4 | `u16` | format version | `2` |
| 6 | `u16` | header size | `32` |
| 8 | `u32` | reserved | zero |
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
| 0 | `char[32]` | family identifier | zero-terminated; at most 31 usable bytes |
| 32 | `u16` | pixel size | 1 through 255 |
| 34 | `u16` | reserved | zero |
| 36 | `u32` | data offset | at least `0x1000`, four-byte aligned |
| 40 | `u32` | data length | non-zero and within `payload_size` |
| 44 | `u32` | asset CRC | exact font byte range |

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`. The pair `family + pixel size` must be unique within a package. Each asset
must be an LVGL binary font accepted by the firmware's LVGL version.

## Validation and resolution

Firmware validates package structure, identifier syntax, size limits,
uniqueness, non-overlap, and every CRC before committing the header. At startup
LVGL may still reject an individual structurally bounded asset. That asset is
not registered. Font resolution requires an exact uploaded family/size match;
unresolved fonts are not replaced with another font.

## Serial upload protocol

The upload protocol shares the selected telemetry serial transport. The host
can query persisted asset state without starting an upload:

```text
@SC:FONT:INFO
@SC:OK:FONT:INFO:storage=1,package=1,format=2,assets=3,size=24576,reboot_required=0,entries=roboto-black:14;roboto-black:32;inter:24
```

`storage` reports whether the partition is available. `package` reports
whether a valid package is stored. `format`, `assets`, and `size` describe that
package and are zero when none is valid. `reboot_required` is set after a
successful commit until restart. `entries` contains the exact semicolon-separated
manifest keys in `family:size_px` form and is empty for an asset-free package.

The host starts a session with the complete package size:

```text
@SC:FONT:BEGIN:size=<bytes>
```

Firmware validates the size and erases the font partition in a dedicated
static FreeRTOS task. When ready for binary data, it replies:

```text
@SC:OK:FONT:READY:max_chunk=1024
```

After this response, every host request is a binary frame. The host sends only
one frame at a time and waits for its response before sending the next one.

| Offset | Size | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `SCF1` |
| 4 | 1 | type | `1` data, `2` commit, `3` cancel |
| 5 | 1 | reserved | zero |
| 6 | 4 | sequence | unsigned little-endian, starting at zero |
| 10 | 2 | payload length | unsigned little-endian, 1–1024 for data, zero otherwise |
| 12 | 2 | reserved | zero |
| 14 | variable | payload | package bytes for a data frame |
| following | 4 | frame CRC | CRC32 of the header and payload |

The maximum frame size is 1042 bytes. The commit and cancel frames use the next
expected sequence number. Each accepted data frame receives:

```text
@SC:OK:FONT:ACK:sequence=<sequence>,received=<total_bytes>
```

A frame with a bad CRC or unexpected sequence cancels the session, as do other
structural or storage errors. Errors use `@SC:ERR:FONT:<reason>` and return the
transport to normal line mode. Sending data before the previous response is a
protocol overrun and also cancels the session.

Commit is accepted only after exactly the declared package size has arrived.
Firmware validates the candidate, writes its header last, verifies the stored
package, and replies:

```text
@SC:OK:FONT:COMMITTED:reboot_required=1
```

Cancel replies with `@SC:OK:FONT:CANCELLED`. Ten seconds without a complete
request cancels an active session with `@SC:ERR:FONT:timeout`. During a session,
all received bytes belong to the font protocol; normal line commands and
telemetry input resume after commit, cancel, timeout, or error.

The configurator converts TTF/OTF sources with the official `lv_font_conv`
binary output, four bits per pixel, compression disabled, and printable ASCII
range `0x20` through `0x7E`. Broader glyph-range selection and compressed
assets remain later improvements.
