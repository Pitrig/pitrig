# ADR 0030: Addressable LED Peripherals, and a Board With No Display

Status: Accepted. Fills the `hardware` section
[ADR 0024](0024-separate-configuration-documents.md) reserved, answers the
question [ADR 0002](0002-display-driver-boundary.md) left open about authoring
for a display-less board, and relocates the resolver
[ADR 0017](0017-conditional-widget-styling.md) said a second consumer would
reuse. The Decision below states the current rules; the amendments record how
the schema moved from 21 to 24 to reach them.

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
values of that enum rather than further sections. A type the firmware does not
know is rejected rather than ignored, so a document authored against newer
firmware fails loudly on an older board.

**A device is a pin and a shape.** `rgb_strip` is a data pin and a `count` of
lamps, optionally with `segments` — straight runs of a `count` in a `direction`,
in wire order — describing how it is mounted; firmware validates the runs and
reads them for nothing else, since a chain is clocked out in wire order whatever
shape it is bent into, and the configurator bends its previews to match.
`rgb_matrix` is a data pin and a grid of `width` by `height` — sixteen on a
side at most — with the `order` its rows are wired in, the `origin` corner the
data line enters, and a quarter-turn `rotation_deg`. They are *separate
devices, not segments of a shared chain*. Daisy-chaining several panels onto one
line would save pins, and an earlier draft did exactly that; it was dropped
because a chain makes every device's lamp numbering depend on what sits before
it, so inserting a panel renumbers every layer after it, and nothing on a WS2812
line can be asked what it is. Separate devices make each one's numbering start
at zero and answer only to itself. The price is a pin and a transmit channel
each, which caps a board at four devices, because four is how many RMT transmit
channels both the ESP32-S3 and the ESP32-P4 have. The device's `brightness` is
the one brightness: a layer has none of its own, because per-layer scaling
multiplied every colour choice by a second axis nobody asked for.

**Effects stack, and the layer that lit last wins a shared lamp.** This is
deliberately the opposite of a widget's styling rules, and the reason is that
the two answer different questions. A widget resolves *one* appearance for one
object, so the first matching rule is the answer and evaluation stops. An
output composes a *picture* out of several things being true at once — shift
lights and a yellow flag and a pit-limiter flash are not competing descriptions
of one lamp, they are layers over a device. Overwriting is what lets a flag be
authored without knowing what sits under it, and time decides who overwrites:
the render pass paints from the oldest activation to the newest, so the layer
whose gate just came true is the news, while layers that came up in the same
frame — every `always` layer — keep authored order. A document that gates
nothing therefore reads as the array says.

**A layer covers lamps, or pixels.** On a strip a layer addresses `from` and
`count` in wire order, and `mirrored`/`inverted` are one `Direction` — plain,
inverted, mirrored, or mirrored from both ends closing on the middle, which is
the fourth direction a rev bar wants. On a panel it names pixels with
`panel_mask`, four to a hexadecimal digit, because wire order on a serpentine
panel is not a shape anyone can see; the layer works over the smallest box
holding the chosen pixels, the mask clips inside it, and an empty mask means the
whole panel. Underneath, a strip is a matrix one row tall and `Surface` walks a
box in both cases.

**The value pipeline is reused unchanged.** An effect binds telemetry through
the same `ValueSourceConfiguration`, maps it through the same `ValueRange`,
lights lamps through the same `IndicatorSegment` thresholds the on-screen
indicator uses, and colours them through the same `ColorStop` ramp. A gate is
the slot page's rule struct, renamed `ValueCondition` because two features now
share it.

**A layer's colour may answer telemetry, and its ground with it.** `color_rules`
is a bounded **first-match** list of `op`/`value`/`color`/`background_color`/
`blink_ms`/`hold_ms` over the layer's `condition_source` — the one place a layer
resolves rather than composes, because a rule describes one layer's appearance
the way a widget's styling rule describes one widget. `color` repaints what the
layer draws: the ink of `text`, the colour of `solid` and `animation`, the fill
of a `gauge` with no ramp, and every lit pixel of a `sprite` except black, which
is the unlit lamp by convention. `background_color`, on the layer or on a rule,
fills the lamps the layer covers before it draws. The layer still watches
exactly one value: the validator requires `condition_source` when the gate or a
rule reads it, rejects it when neither does, and rejects a rule that paints
nothing. A rule's `hold_ms` keeps it applied after it stops matching and its
`blink_ms` takes over from the layer's while it holds; a rule carries no
`hidden`, because that would be a second gate wearing the clothes of a
description.

**The resolver became a service.** `platform/dashboard/conditions` moved to
`services/value_conditions` under the namespace `simcore::conditions`. A module
may depend on a service but not on platform code, and the resolver's real
dependencies were only the configuration contract, telemetry and
`number_transform`. Call sites are unchanged: unqualified `conditions::` still
resolves from inside `simcore::dashboard`.

**Artwork travels in the document, and is drawn in the configurator.** A sprite
is palette-indexed at four bits a pixel — an eight-by-eight frame is sixty-four
digits — so a whole icon set is a few kilobytes and fits inside the `modules`
payload, raised from 1 KB to 32 KB: no new partition, no `erase-flash` over a
cable, no fourth asset kind, and a saved configuration that carries its own
artwork. The last palette digit is the clear ink, so a picture leaves the layers
under it visible. The Pictures page draws them — pixels, frames, palette,
playback through the real painter — and `sprite_loop` walks a sprite's frames on
the layer's own timebase, one every `speed_ms`, while `sprite_frame` still means
one held frame. There is no import: a picture this size is drawn faster than it
is sourced.

**Text uses a compiled bitmap face.** The faces — `regular_4x6`, `bold_4x6`,
`regular_6x8`, `bold_6x8`, named by the pixels a glyph occupies and its weight
— are generated from `fonts/led_bitmap_font.json` into both the firmware table
and the configurator's preview, and carry only the digits, `N` and `R`: a gear
readout is what a panel this small can spell legibly. TinyTTF at eight pixels is
unreadable, and the board that most wants a matrix is the one with no display to
install a font package for.

**A board declares its free pins.** `ValidationContext` grows the list of pins
the board leaves free, and an authored pin is checked against it — the same
shape as the exact-match UART rule. A board that publishes an empty list refuses
every LED output, which is the honest state for a connector not yet verified.

**A board with no display carries no dashboard.** `esp32s3_devkit` is the first
board whose descriptor names no panel. A `dashboard` section on such a board is
rejected rather than quietly ignored, because an author who wrote one meant it
to be drawn somewhere.

**Status is a board fact, not a configuration.** `BoardDefinition::status_led`
is an optional single-lamp descriptor needing no document, so it works on the
recovery surface where ADR 0025 composes no modules — exactly when a board with
no screen has nothing else to say with. It reports booting, safe mode,
telemetry silence and upload progress. The user's own outputs stay
configuration, and the recovery surface still composes none of them.

**One task, sixty frames a second.** The module owns a FreeRTOS task that
repaints every output on a fixed tick and feeds the watchdog, because the
event-bus handler runs on the transport read task and blocking it would stall
telemetry for every widget as well. The handler does one atomic store — the
timestamp the `telemetry_idle` gate reads — and nothing else. A dropped frame is
dropped, not caught up: `xTaskDelayUntil` returns at once for every deadline
already past, so a task starved for a tenth of a second clocked out six chains
back to back and lamps lit at random; the loop re-seeds its cadence when it
finds itself late, and the RMT channel takes a raised interrupt priority.

**A `modules` apply restarts modules only.** Applying that document no longer
falls through to the full recompose, which destroys and rebuilds the dashboard;
live apply fires on a 250 ms debounce while a slider is dragged, so the screen
would have strobed. This is sound because `modules` owns only `hardware`.

## Consequences

- Documents authored against an older schema are refused rather than migrated,
  per ADR 0024; the configurator migrates its own saved files, because a file
  it wrote is a file it can read. Schema 21 also renamed `SlotCondition` to
  `ValueCondition`, which changes no JSON key.
- Four devices is the ceiling, because each takes a pin and an RMT transmit
  channel and that is how many both chips have. On the DevKitC-1 the status
  lamp holds one of them for the whole boot, so its board profile admits three.
- `ApplicationConfiguration` grows about 95 KB for the peripherals, doubled by
  the active/scratch pair, and lives in external RAM: 400,892 bytes at
  schema 24 (389,628 before `color_rules`; 414,204 before the sixteen-pixel
  side, which took 192 bytes off every `LedEffect`).
- The frame buffers are sized by the configured devices and allocated when the
  module starts: working and shadow colour bytes prefer external RAM, the wire
  bytes are internal DMA-capable, and a board that drives no LEDs allocates
  nothing.
- The preview in the configurator is a second implementation of the painters,
  kept in step by mirroring the firmware's painting code line for line; there
  is no automated lamp-for-lamp comparison. Playing a picture or a layer goes
  through the same `paintOutput` the layers use, so it is not a third.
- Indexed sprite colour means a sprite cannot fade; a frame is a lookup, not a
  gradient. Animation belongs to the `animation` effect, which is not indexed.
- A board that declares no free LED pins can carry no LED output at all. Every
  board declares some today — five pins on the 4848S040, eleven on the
  JC1060P470C, ten on the T-Display and sixteen on the DevKitC-1.
- **Releasing an output darkens it first.** These lamps latch the last frame
  they were sent, so `led::Output::close()` transmits an all-zero frame and
  waits for it before releasing the channel — without which a `modules` apply
  that moves a device to another pin leaves the old pin lit beside the new one.
- Resolving an overlap by activation time costs one stable insertion sort of at
  most thirty-two indices a frame and a second telemetry read per layer, since
  the gate pass runs before the order is known.
- The configurator's layer profiles (shift lights, flags, ABS, traction
  control, pit limiter, DRS, link-lost) are configurator data: each expands to
  plain `LedEffect` entries over the contract above, generating flag artwork
  into `sprites` on a matrix — a moving picture takes as many frames as the
  1024-digit budget holds, sixteen of eight by eight or four of sixteen by
  sixteen — and the firmware knows nothing of them. With no game attached, the
  preview holds each colour rule's threshold in turn and cycles a gear readout
  through `R`, `N` and 1 to 9; neither reaches the board.

## Amendments

**Schema 22 — arrangement, one brightness, masks, faces, playing sprites.**
`segments` on a strip; `LedEffect.brightness` removed; `mirrored` and
`inverted` folded into one `Direction`, because inverting a mirrored layer
mapped the set onto itself and the freed combination is the fill that closes on
the middle; `panel_mask` for a layer on a panel; faces renamed by glyph size and
weight and cut to the digits, `N` and `R`, which took each table from fifty-nine
entries to thirty-five, with bold drawn rather than derived because smearing
closes the counters at four columns; `sprite_loop`. The configurator numbers
lamps from **one** while `from` stays zero-based, and draws a turn in a strip's
segments as a diagonal step.

**Schema 23 — sixteen on a side.** `kMaximumMatrixSide` became 16, not 32. The
old bound was half unusable — a square at thirty-two is 1024 lamps and an
output is refused above 512 — and `panel_mask` is sized from it, so the change
returned 48 KB of external RAM across the active/scratch pair. Capacity follows
area: 64 digits cover any 256-pixel panel, so an eight-by-thirty-two panel is
refused only by the side bound, which is the line to move if one is ever
wanted. Narrowing a public range is a breaking change, hence the bump.

**No schema change — pictures are drawn.** This reversed the schema-22 position
that sprites arrive only with a profile: a panel is mounted to show something
its owner chose. The editor stays inside the validators — a palette is capped at
fifteen colours so `f` always means clear, frames per picture are
`floor(1024 / area)` capped at sixteen, growing a picture trims its frames,
renaming one retargets every layer that draws it, removing frames clamps each
layer's `sprite_frame`, and removing an ink remaps the digits above it — so an
editor action can never make the document unsaveable.

**Schema 24 — a six-pixel face, colours that answer telemetry.**
`regular_5x8`/`bold_5x8` became `regular_6x8`/`bold_6x8`, redrawn: five columns
closed the round digits and left bold a single column to thicken into.
`color_rules` arrived as described above; the document grows twenty bytes a
rule, four rules in each of a hundred and twenty-eight layers.

**No schema change — an overlap is resolved by when a layer lit.** "A later one
wins" had meant later in the authored array, which is a poor proxy once layers
are conditional: the flag that just came true could sit under a layer showing
for ten minutes, and the only fix was reordering a list whose order is invisible
until both conditions hold at once, on track. The timestamp is
`EffectState::started_us`, which the gate already kept as the animation
timebase, so no new state was added. The preview plays several layers at once,
in the order they were pressed, and the board preview applies that set over
`@SC:APPLY`.
