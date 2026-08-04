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

The active slot is mapped read-only from flash and font byte ranges are passed
to the LVGL binary font loader. The current `lv_binfont_create_from_buffer`
implementation materializes the opened font's glyph metadata and bitmap data
in the LVGL heap. A dedicated PSRAM-backed runtime pool is intentionally
deferred; the persisted package remains memory-mapped and independently
recoverable regardless of that runtime allocation policy.

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

## Serial upload protocol

The upload protocol shares the selected telemetry serial transport. The host
starts a session with one line-oriented command containing the complete package
size:

```text
@SC:FONT:BEGIN:size=<bytes>
```

Firmware validates the size and erases the inactive slot in a dedicated static
FreeRTOS task. When it is ready for binary data, it replies:

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
| following | 4 | frame CRC | CRC32 of the 14-byte header and payload |

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
Firmware then validates and atomically commits the inactive slot and replies:

```text
@SC:OK:FONT:COMMITTED:reboot_required=1
```

Cancel replies with `@SC:OK:FONT:CANCELLED`. Ten seconds without a complete
request cancels an active session with `@SC:ERR:FONT:timeout`. During a session,
all received bytes are owned by the font protocol; normal line commands and
telemetry input resume after commit, cancel, timeout, or error.

The storage service, runtime registry, and firmware upload protocol are
implemented. Configurator-side TTF/OTF conversion and upload orchestration are
outside this phase.
