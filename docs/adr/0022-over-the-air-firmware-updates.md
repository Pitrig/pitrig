# ADR 0022: Over-the-Air Firmware Updates

Status: Accepted. [ADR 0025](0025-startup-order-and-safe-mode.md) narrows the
rollback trigger: the running image is marked valid as soon as the serial link
is up, so rollback catches only an image that cannot be talked to.

## Context

Every SimCore board is updated by cable. The partition table carried a single
`factory` application partition, the firmware contained no `esp_ota_*` call, and
installing a new build meant `idf.py flash` from a checkout of the source. That
is fine for the person writing the firmware and useless for anyone else running
one.

The device is already attached to a PC by USB whenever it is used at all —
that is where telemetry comes from — and it already accepts two kinds of large
uploaded payload over that link. Firmware is a third payload of the same shape,
so this is mostly a question of partition layout and of what may be trusted.

Two constraints shaped the layout. The ESP32-P4 bootloader has 1 296 bytes of
its 24 KiB left, which decides whether rollback support fits at all; and the
`simcore_cfg` partition needed to grow from 256 KiB to 1 MiB at the same time
(ADR 0009), which meant one migration rather than two.

## Decision

**Two application slots and no `factory`.** The partition table becomes
`ota_0` and `ota_1`, 2.5 MiB each, with an `otadata` partition selecting between
them. Nothing falls back to a compiled-in image: if both slots are unusable the
device is recovered over USB. That is an acceptable floor precisely because the
device is a USB peripheral — a SimCore board with no cable attached is not
running a session either. The alternative, `factory` plus one OTA slot, spends
2 MiB to protect against a case where the user already has the cable in hand.

**The layout is contiguous and every data partition moves.** Installing it
requires `erase-flash`, which discards the stored configuration, the font
package and the image package. Preserving the asset partitions at their old
offsets was possible and was rejected: it left a 256 KiB hole in the table and
kept a layout shaped by history rather than by what is stored. ADR 0009 made the
same trade when the configuration partition first appeared.

The default `nvs` partition shrinks from 24 KiB to 16 KiB. Nothing reads it —
the configuration lives in `simcore_cfg` and no other component opens NVS — and
at 16 KiB the partitions before the first application slot end exactly at
`0x10000`, where a 64 KiB-aligned application partition has to start. At its old
size the alignment would have cost 56 KiB in a gap.

**Every byte of the part is a partition, including the ones nothing uses yet.**
The table was first installed with 4.94 MiB left unallocated, which read as a
reserve and was not one: a partition table travels only over a cable and only
with a full erase behind it, so space that is not a partition today can never be
given to a board that has already shipped. The revised table spends that tail
and the 512 KiB reclaimed from `simcore_cfg` — 2.5 MiB slots, 3 MiB of fonts,
7 MiB of images — and turns what is left into two declared, deliberately empty
partitions: `coredump`, which needs only `CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH`
to come alive, and `reserve`, for the next uploaded asset kind. Both can then be
put to use by an ordinary firmware update rather than by another migration. The
sizes are chosen once, before boards are in other people's hands, because that
is the only moment when getting them wrong costs a developer's own `erase-flash`
rather than everyone's.

The slots grew from 2 MiB to 2.5 MiB with the image at 0.95 MiB, which is not
pressure. It is the one failure among these that cannot be repaired in the
field: an asset partition that turns out too small refuses a package and an
author makes a smaller one, while a slot that turns out too small refuses the
update that would have fixed anything.

**An asset update erases what the package needs, not the partition.** With
stores sized for the largest package a board may ever hold — and image pixels
deflated, so a real package is usually a fraction of one — erasing seven
megabytes ahead of every upload would have made the erase, not the transfer,
the slowest part of installing a dashboard's artwork. `IStorage` therefore
carries both: the whole store for a `CLEAR`, and a length for an update. Nothing
reads past `payload_size`, so what stays behind an incoming package is
unreachable rather than stale.

**One upload frame carries 4 KiB rather than 1, in a buffer the three kinds
share.** The engine is stop-and-wait: one frame, one acknowledgement, no
window. A package therefore costs its size divided by the frame size in round
trips, and at 1 KiB a 7 MiB package would spend minutes in latency alone on the
slowest link. Widening it costs internal RAM, and a buffer per kind would have
cost it three times over — which the claim makes pointless, since only the kind
holding the stream is assembling anything. The composition owns one buffer and
hands each engine a span of it.

**Rollback is on.** `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` costs 128 bytes of
the P4 bootloader and 64 of the S3 one, both of which fit. A freshly installed
image boots pending verification; `core` clears it after `start_communication`
returns. An image that cannot reach that line is undone by the bootloader on the
next reset instead of leaving a board that has to be opened up. A timed
criterion — *N* seconds of successful rendering — was considered and dropped: it
adds state to carry and asserts less than reaching that line already does.

That line used to be the end of startup, because the link came up last.
[ADR 0025](0025-startup-order-and-safe-mode.md) moved the link ahead of the
display, so it now means only that the board can be talked to — which is what an
image actually has to prove, since everything past it is repairable over that
link and nothing short of it is.

**Firmware is the third consumer of the `SCF1` upload engine.** The `@SC:FW:`
namespace joins `@SC:FONT:` and `@SC:IMAGE:` over the same frames, the same
stop-and-wait sequence, the same inactivity timeout and the same
`binary_session::Claim` — so a firmware upload beginning while a font package is
in flight is answered `busy` rather than raced. `services/firmware_update`
supplies the protocol tag, the `INFO` body and operations that map onto
`esp_ota_begin` / `esp_ota_write` / `esp_ota_end` and
`esp_ota_set_boot_partition`.

It is one component rather than the service-and-wrapper pair that fonts and
images use. Those two split because their services have a consumer outside the
protocol — the dashboard reads faces and bitmaps — while nothing reads a
firmware image at runtime, so the second component would exist for a single
caller.

**The image is wrapped, and the wrapper names the board.** ESP-IDF rejects an
image built for another chip, but the T-Display-S3 and the Guition
ESP32-4848S040 are both ESP32-S3: swapping their images produces a board that
boots and drives the wrong display. So an application image travels inside the
same 32-byte package header the other two kinds use — magic `SCFW`, format
version, sizes, manifest CRC, payload CRC, header CRC — with a manifest of one
entry holding the `BoardId`. The header is validated **before** `esp_ota_begin`
is called, so an image for the wrong board never reaches flash.

The board identity is passed into the service rather than read from
`board_registry`, which is platform code a service may not depend on.

`CLEAR` is answered `invalid_state`: the only images on the device are the one
running and the one it would fall back to, and neither is erasable on request.

## Consequences

- Updating a board no longer needs a toolchain, a checkout, or `idf.py`.
- Installing this partition table is a one-time full erase. Configuration must be
  re-saved and the font and image packages re-uploaded.
- The whole 16 MiB part is allocated and nothing is left unnamed. What is spare
  is spare *inside* a partition, where a firmware update can reach it.
- The application image grew by about 18 KiB, which is what `app_update` and the
  new service cost. At 0.95 MiB in a 2.5 MiB slot, every board keeps well over
  half of its slot free.
- `simcore_cfg` at 512 KiB still holds several stored configurations, but fewer
  than the 1 MiB ADR 0009 sized for. Three documents come to 66 KiB, so the
  headroom is now measured in a handful of them rather than in dozens.
- The upload frame at 4 KiB cuts an upload's round trips by four. Measured on
  the T-Display-S3 build, sharing one buffer instead of three returns 8 208
  bytes of internal RAM, so the widening costs 1 008 bytes net rather than
  9 216.
- The P4 bootloader now has 1 296 bytes of headroom. Anything that adds to it —
  secure boot, flash encryption, anti-rollback — will need
  `CONFIG_PARTITION_TABLE_OFFSET` moved past `0x8000` first.
- A rollback to older firmware finds a configuration written by the newer one.
  Records of an unknown schema are already treated as unsupported and fall back
  to another slot or to the factory configuration, so the board comes up on the
  factory dashboard and names the reason in its boot log. The two slots share one
  `simcore_cfg` (ADR 0009); giving each its own would have avoided this and was
  rejected because it makes the common case worse — a configuration saved before
  an update would vanish after it.
- Updating over a network is still out of scope. WiFi is not enabled in any
  build and the ESP32-P4 has no radio of its own, so the serial link is the only
  path.
