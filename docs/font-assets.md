# Font asset storage

This document defines font asset package format version 3. It is the contract
between the configurator and the firmware font asset service. It is separate
from the device configuration schema and from configuration NVS.

A package carries font faces, one per family, exactly as the user selected
them. Pixel sizes are not stored: the device rasterizes every size a
configuration asks for from the installed face.

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
mapped read-only at startup and firmware copies each face into external RAM
before creating any font. That copy is what allows the mapping to be released
by a later upload while the dashboard keeps rendering: a rasterizer re-reads
the face on every glyph cache miss, so a font pointing into the released
mapping would fault.

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
| `0x1000` | variable | Aligned font face data |

`payload_size` is the exact package size and may not exceed 2 MiB. Every asset
range must be fully contained in `[0x1000, payload_size)`. Asset offsets are
four-byte aligned and must not overlap.

### Header

| Offset | Type | Field | Rule |
| ---: | --- | --- | --- |
| 0 | `u32` | magic | bytes `SCFA` |
| 4 | `u16` | format version | `3` |
| 6 | `u16` | header size | `32` |
| 8 | `u32` | reserved | zero |
| 12 | `u16` | entry count | 0 through 8 |
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
| 32 | `u32` | reserved | zero |
| 36 | `u32` | data offset | at least `0x1000`, four-byte aligned |
| 40 | `u32` | data length | non-zero and within `payload_size` |
| 44 | `u32` | asset CRC | exact face byte range |

Family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`, or
`-`, and must be unique within a package. Each asset must be a TTF or OTF face:
firmware checks the sfnt signature (`0x00010000`, `OTTO`, `true`, or `ttcf`)
and a minimum length, because a face is parsed lazily while rendering and a
malformed one must be rejected at commit rather than inside a frame.

## Validation and resolution

Firmware validates package structure, identifier syntax, size limits,
uniqueness, non-overlap, the sfnt signature, and every CRC before committing the
header. A configuration resolves against installed families: a family that is
not installed is a composition error and is never replaced with another font,
while any pixel size of an installed family resolves without an upload or a
restart.

## Serial upload protocol

The upload protocol shares the selected telemetry serial transport. The host
can query persisted asset state without starting an upload:

```text
@SC:FONT:INFO
@SC:OK:FONT:INFO:storage=1,package=1,format=3,families=2,size=311296,reboot_required=0,entries=inter;roboto-black
```

`storage` reports whether the partition is available. `package` reports
whether a valid package is stored. `format`, `families`, and `size` describe
that package and are zero when none is valid. `reboot_required` is set after a
successful commit until restart. `entries` contains the semicolon-separated
family identifiers and is empty for a package without faces.

The host can erase the complete installed package outside an upload session:

```text
@SC:FONT:CLEAR
@SC:OK:FONT:CLEARED:reboot_required=1
```

Clear is rejected while an update is active or another font change is pending
a reboot. The active dashboard may keep already materialized font data until
the required reboot; after restart, configurations referencing cleared fonts
report unresolved dependencies.

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

The configurator uploads the selected TTF or OTF file unchanged; there is no
conversion step and no glyph range to choose.

## Runtime rasterization

Firmware creates one font object per family and pixel size the active
configuration references, over the external-RAM copy of that family's face.
Each font owns a bounded glyph cache holding rendered 8-bit alpha bitmaps, and
those bitmaps are allocated in external RAM so a large size cannot exhaust
internal memory.

Fonts are created without kerning. A cached advance width is then independent
of the neighbouring glyph, which is what lets composition pre-warm the cache
one glyph at a time.

Dashboard composition warms each font it creates: the characters the runtime
emits on its own (digits, the time transform's separators and sign) plus the
characters the configuration supplies (widget titles, transform prefixes and
suffixes, unavailable and placeholder text). A character outside that set is
rasterized when it is first drawn, which costs one longer frame and is then
cached.
