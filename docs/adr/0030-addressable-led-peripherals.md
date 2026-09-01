# ADR 0030: Addressable LED Peripherals, and a Board With No Display

Status: Accepted. Fills the `hardware` section
[ADR 0024](0024-separate-configuration-documents.md) reserved, answers the
question [ADR 0002](0002-display-driver-boundary.md) left open about authoring
for a display-less board, and relocates the resolver
[ADR 0017](0017-conditional-widget-styling.md) said a second consumer would
reuse.

## Context

The vision names LED modules as a device class SimCore exists to support, and
the architecture has recorded LED strips and matrices as owed components since
it was written. Everything around them was already built: the `modules` document
and its `hardware` section were parsed, validated, stored, key-checked, mirrored
into TypeScript, given an error token and a workspace page — all of it only to
reject a non-empty value until a peripheral had a driver.

Two shapes were available for what drives the lamps. SimHub's Arduino support —
the thing sim racers already know — composes a picture from a stack of effects,
each covering a run of lamps, where a later effect overwrites the lamps it
covers. The dashboard's own styling rules do the opposite: an ordered list where
the *first* match describes the widget and the rest are skipped.

## Decision

**One peripheral list, discriminated by `type`.** `hardware` is an array of
devices, each naming a `type` the firmware has a driver for. `rgb_strip` and
`rgb_matrix` are the only kinds so far; buttons and encoders become further
values of that enum rather than further sections. A type the firmware does not know is rejected rather than
ignored, so a document authored against newer firmware fails loudly on an older
board.

**A device is a pin and a shape.** `rgb_strip` is a data pin and a `count` of
lamps; `rgb_matrix` is a data pin and a grid of `width` by `height` with the
`order` its rows are wired in, the `origin` corner the data line enters, and a
quarter-turn `rotation_deg`. They are *separate devices, not segments of a
shared chain*. Daisy-chaining several panels onto one line would save pins, and
an earlier draft of this ADR did exactly that; it was dropped because the saving
is not worth what it costs to author. A chain makes every device's lamp
numbering depend on what sits before it, so inserting a panel renumbers every
layer after it, and nothing on a WS2812 line can be asked what it is — the
author has to describe the whole order correctly and keep it correct. Separate
devices make each one's numbering start at zero and answer only to itself.

The price is a pin and a transmit channel each, which caps a board at four
devices, because four is how many RMT transmit channels both the ESP32-S3 and
the ESP32-P4 have. Two matrices and two strips fit; a fifth device does not.

**Effects stack; a later one wins.** This is deliberately the opposite of a
widget's styling rules, and the reason is that the two answer different
questions. A widget resolves *one* appearance for one object, so the first
matching rule is the answer and evaluation stops. An output composes a *picture*
out of several things being true at once — shift lights and a yellow flag and a
pit-limiter flash are not competing descriptions of one lamp, they are layers
over a chain. Overwriting is what lets a flag be authored without knowing what
sits under it.

**The value pipeline is reused unchanged.** An effect binds telemetry through
the same `ValueSourceConfiguration`, maps it through the same `ValueRange`,
lights lamps through the same `IndicatorSegment` thresholds the on-screen
indicator uses, and colours them through the same `ColorStop` ramp. A gate is
the slot page's rule struct, renamed `ValueCondition` because two features now
share it. Nothing about how a value reaches a lamp is new.

**The resolver became a service.** `platform/dashboard/conditions` moved to
`services/value_conditions` under the namespace `simcore::conditions`. A module
may depend on a service but not on platform code, and the resolver's real
dependencies were only the configuration contract, telemetry and
`number_transform` — it was inside an LVGL-linked component by accident of where
it was first needed. Call sites are unchanged: unqualified `conditions::` still
resolves from inside `simcore::dashboard`.

**Artwork travels in the document.** A sprite is palette-indexed at four bits a
pixel — an eight-by-eight frame is thirty-two bytes — so a whole icon set is a
few kilobytes and fits inside the `modules` payload, raised from 1 KB to 32 KB.
This is the decisive simplification: no new partition, and therefore no
`erase-flash` over a cable, so the whole feature reaches boards already in the
field over the air. It also means no fourth asset kind, no upload session to
arbitrate, and a saved configuration that carries its own artwork.

**Text uses a compiled bitmap face.** Two faces, three by five and five by
seven, generated from `fonts/led_bitmap_font.json` into both the firmware table
and the configurator's preview. TinyTTF at eight pixels is unreadable, and the
board that most wants a matrix is the one with no font partition at all.

**A board declares its free pins.** `ValidationContext` grows the list of pins
the board leaves free, and an authored pin is checked against it — the same
shape as the existing exact-match UART rule, and the "safe board connector pin
mapping" `device-configuration.md` already named as missing. A board that
publishes an empty list refuses every LED output, which is the honest state for
a board whose connector has not been verified.

**A board with no display carries no dashboard.** `esp32s3_devkit` is the first
board whose descriptor names no panel. A `dashboard` section on such a board is
rejected rather than quietly ignored, because an author who wrote one meant it
to be drawn somewhere. The display bounds check is separated from the hardware
check that used to share its `if`.

**Status is a board fact, not a configuration.** `BoardDefinition::status_led`
is an optional single-lamp descriptor needing no document, so it works on the
recovery surface where ADR 0025 composes no modules — which is exactly when a
board with no screen has nothing else to say with. It reports booting, safe
mode, telemetry silence and upload progress. The user's own outputs stay
configuration, and the recovery surface still composes none of them.

**One task, sixty frames a second.** The module owns a FreeRTOS task that
repaints every output on a fixed tick and feeds the watchdog, because the
event-bus handler runs on the transport read task and blocking it would stall
telemetry for every widget as well. The handler does one atomic store — the
timestamp the `telemetry_idle` gate reads — and nothing else.

**A `modules` apply restarts modules only.** Applying that document no longer
falls through to the full recompose, which destroys and rebuilds the dashboard.
Live apply fires on a 250 ms debounce while a slider is being dragged, so the
screen would have strobed. This is sound because `modules` owns only `hardware`,
and what enables the Lap Timer is decided by the `dashboard` section.

## Consequences

- Schema version 21. Documents authored against 20 or older are refused rather
  than migrated, per ADR 0024; `SlotCondition` is renamed `ValueCondition` in
  the same bump, which changes no JSON key.
- Four devices is the ceiling, because each takes a pin and an RMT transmit
  channel and that is how many both the ESP32-S3 and the ESP32-P4 have. On the
  DevKitC-1 the status lamp holds one of them for the whole boot, so its
  board profile admits three. A fifth needs a second backend, or the chaining
  this ADR rejected.
- `ApplicationConfiguration` grows about 90 KB, doubled by the active/scratch
  pair. It lives in external RAM, which every supported board has.
- The frame buffers are sized by the configured devices and allocated when the
  module starts: working and shadow colour bytes prefer external RAM, the wire
  bytes are internal DMA-capable, and a board that drives no LEDs allocates
  nothing.
- The preview in the configurator is a second implementation of the painters,
  kept in step by mirroring the firmware's painting code line for line; there
  is no automated lamp-for-lamp comparison.
- Indexed sprite colour means a sprite cannot fade; a frame is a lookup, not a
  gradient. Animation belongs to the `animation` effect, which is not indexed.
- A board that declares no free LED pins can carry no LED output at all. The two
  Guition boards are in that state until their connectors are verified.
