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
pixel — an eight-by-eight frame is sixty-four digits — so a whole icon set is a
few kilobytes and fits inside the `modules` payload, raised from 1 KB to 32 KB.
This is the decisive simplification: no new partition, and therefore no
`erase-flash` over a cable, so the whole feature reaches boards already in the
field over the air. It also means no fourth asset kind, no upload session to
arbitrate, and a saved configuration that carries its own artwork.

**Text uses a compiled bitmap face.** The faces are generated from
`fonts/led_bitmap_font.json` into both the firmware table and the
configurator's preview, and are named by the pixels a glyph occupies and its
weight; the amendment below carries the current set. TinyTTF at eight pixels is
unreadable, and the board that most wants a matrix is the one with no display to
install a font package for.

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

**A dropped frame is dropped, not caught up.** `xTaskDelayUntil` returns
immediately for every deadline already in the past, so a task starved for a
tenth of a second then runs six renders back to back — six chains clocked out
with nothing between them, which is where a stall turned into lamps lighting at
random. The loop now re-seeds its cadence when it finds itself late, and the RMT
channel takes a raised interrupt priority so a refill is less likely to be the
thing that made it late.

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
- `ApplicationConfiguration` grows about 95 KB, doubled by the active/scratch
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
- A board that declares no free LED pins can carry no LED output at all. Every
  board declares some today — five pins on the 4848S040, eleven on the
  JC1060P470C, ten on the T-Display and sixteen on the DevKitC-1.
- **Releasing an output darkens it first.** These lamps latch the last frame they
  were sent, so a chain whose transmit channel is simply torn down goes on
  showing it for as long as it has power. `led::Output::close()` therefore
  transmits an all-zero frame and waits for it before releasing the channel —
  without which a `modules` apply that moves a device to another pin leaves the
  old pin lit beside the new one, and so does removing a device or shortening a
  chain.

## Amendment: physical arrangement, and one brightness (schema 22)

**A strip may describe its mounting.** `segments` on an `rgb_strip` is a list of
straight runs — a lamp `count` in a `direction`, in wire order — so "eight up
the left, sixteen across the top, eight down the right" is authored once and
travels with the document. The firmware validates the runs (strip only, counts
summing to the strip's own) and reads them for nothing else: a WS2812 chain is
clocked out in wire order whatever shape it is bent into. What the field buys is
authoring — the configurator bends its previews to match the mounting, numbers
the run boundaries, and offers the runs as ready-made targets when a layer is
placed — and it lives in the document rather than in editor state because the
arrangement belongs to the configuration, not to the machine it was authored on.
A turn is drawn as a diagonal step, one lamp along each direction, so a column
and the row leaving it never share a cell; and the configurator numbers lamps
from **one** throughout, while `from` in the document stays zero-based, because
the author is counting physical lamps rather than indexing an array.

**A layer has no brightness of its own.** `LedEffect.brightness` is removed; the
device's `brightness` is the one knob, applied to the whole frame on its way to
the wire. Per-layer scaling let one layer sit dimmer under another, but in
practice it multiplied every colour choice by a second axis nobody asked for —
a dimmer layer is authored with a dimmer colour. The configurator drops the key
from older saved files on load; the firmware, per ADR 0024, refuses rather than
migrates.

**`mirrored` and `inverted` are one direction, not two switches.** The pair had
three meanings and four combinations: a mirrored layer's lamps are symmetric
about its centre, so inverting them mapped the set onto itself and the second
flag did nothing at all. It now reverses the mirror instead — the fill starts at
both ends and closes on the middle — which is the fourth direction a rev bar
actually wants and the only combination that was free to take. The configurator
offers the four as one `Direction` choice rather than two checkboxes, since
"invert" meant nothing on its own once mirroring was on.

**A layer on a panel names pixels, not a run.** `panel_mask` says which pixels a
layer paints on, four to a hexadecimal digit, because `from` and `count` address
lamps in *wire* order — on a serpentine panel that is not even a straight line,
so no author can see the shape they are choosing. It is a mask rather than a
rectangle because the author picks pixels by clicking them, and a ring or a
diagonal is not a box. The layer then works over the smallest box holding the
chosen pixels, and the mask clips inside it, so text and a picture still centre
on the shape rather than on the panel. An empty mask means the whole panel,
which is what almost every layer wants and what costs the document nothing; an
eight by eight panel spends sixteen characters on saying anything else. A strip
keeps `from`/`count`, and the two are the same mechanism underneath: a strip is
already modelled as a matrix one row tall, so `Surface` walks a box in both
cases and the linear path disappeared.

**A face is a size, and carries only what a gear spells.** The faces are named
by the pixels one glyph occupies and its weight — `regular_4x6`, `bold_4x6`,
`regular_5x8`, `bold_5x8` — because "small" and "large" say nothing about
whether a glyph fits the panel in front of you. Each carries the digits, `N` and
`R` and nothing else: a gear readout is what a panel this small can spell
legibly, and dropping the rest of the alphabet took each compiled table from
fifty-nine entries to thirty-five, twelve of which carry a glyph. Glyph rows
widened from one byte to two while a ten-pixel face was tried, which is why a
face may now be up to sixteen wide.

Bold is drawn rather than derived. Thickening a face by rule — smearing each
lit pixel one column right — was tried first and closes the counters: at four
columns a `0` fills in and an `N` becomes a block. Four columns leave so little
room that the bold face differs from the regular one mostly in its horizontals.

**A sprite can play itself.** `sprite_loop` walks a sprite's frames on the
layer's own timebase, one every `speed_ms`, the way `animation` and scrolling
`text` already move. Until it existed a sprite's frame came only from telemetry,
so a picture could not move on its own. It is a flag rather than the default so
`sprite_frame` keeps meaning what it says: one named frame, held.

This is what lets the configurator's flag profiles carry real artwork for a
panel — a diagonal band sweeping for the black and white, an orange disc
blinking for the meatball, a rippling chequerboard for the chequered —
generated into `sprites` when the profile is added to a matrix, and falling back
to a blinking blob and a running lamp on a strip. A moving one takes as many
whole frames as the 1024-digit pixel budget holds — sixteen of eight by eight,
four of sixteen by sixteen — while the meatball disc is a single frame that
blinks.

**Sprites arrive with a profile, not from an editor.** There is no sprite
editor: no pixel drawing and no import. Pictures are listed and removed under
Pictures, and the sprite layer type is offered only on a matrix that already
carries one. Profiles over the existing layer kinds cover what a sprite editor
would have been reached for.

The `modules` document's layer profiles (shift lights, flags, ABS, traction
control, pit limiter, DRS, link-lost) are configurator data: each expands to
plain `LedEffect` entries over the contract above, and the firmware knows
nothing of them.

## Amendment: a sixteen-pixel panel (schema 23)

**Sixteen on a side, not thirty-two.** `kMaximumMatrixSide` becomes 16, and
eight by eight — the contract's own default, which does not move — stays what
nearly everyone mounts. The old bound was set where the lamp budget ran out
rather than where panels are built, and it was half unusable anyway: a square
panel at thirty-two is 1024 lamps and one output is refused above 512, so the
largest square that ever validated was twenty-two.

The bound is not free, because `panel_mask` is sized from it. Describing a
thirty-two by thirty-two panel costs 257 bytes in *every* layer of *every*
device, where a sixteen-pixel side needs sixty-four digits and a terminator.
That takes 192 bytes off `LedEffect`, so the mask costs about 8 KB per copy of
`ApplicationConfiguration` where it had cost 32 — 48 KB of external RAM
returned across the active/scratch pair, measured as 414,204 bytes down to
389,628. The capacity actually follows the panel's *area* rather than its side:
64 digits cover any panel of 256 pixels, which is what a sixteen-a-side ceiling
guarantees. A wider-than-tall panel of the same area — eight by thirty-two is
sold as widely as sixteen by sixteen — would fit the same 65 bytes and is
refused only by the side bound, so that is the line to move if one is ever
wanted, not the capacity.

The bound covers a sprite's own geometry too, since `LedSpriteConfiguration`
shares it, which is sound because a sprite is drawn centred on a panel and
clipped to it.

**The schema version moves to 23.** Narrowing the range of a public property is
a breaking change, and this document already requires a later schema version for
one. It is not the same as the bound raises of earlier work, which no stored
document could fail. A record written against 22 is therefore refused whole and
each document falls back to its factory payload, per ADR 0024 — the cost of
saying so loudly rather than letting a stored thirty-two-pixel panel be
reinterpreted.

## Amendment: pictures are drawn, not only delivered (no schema change)

**There is a sprite editor.** This reverses "Sprites arrive with a profile, not
from an editor" above. The reasoning there was that profiles over the existing
layer kinds cover what a sprite editor would have been reached for, and for the
flags that is true — but it answers only the pictures SimCore ships. A panel is
mounted to show something its owner chose, and nothing in the configurator could
make one. The Pictures page now draws them: pixels painted with a chosen ink,
frames added, duplicated, reordered and removed, a palette edited in place, and
the whole thing played back.

**It costs no schema version.** Every field it writes was already in
`LedSpriteConfiguration`, so this is authoring rather than contract, and it
reaches every board already running schema 23 without a firmware update. The
firmware and configurator validators are likewise unchanged; what the editor
does is stay inside them.

**The last digit is the clear ink.** Both painters already skip a digit at or
past the palette's length, which is what lets a picture leave the layers under
it visible. The editor makes that reachable by capping an authored palette at
fifteen colours, so `f` always means clear rather than sometimes meaning a
colour. A picture that already names all sixteen — none does, but a hand-written
document may — is still editable and simply offers no clear ink.

**The budget is spent in the editor rather than discovered at validation.** The
frames a picture may hold follow its area, `floor(1024 / area)` capped at
sixteen, so Add frame stops at four on a sixteen-pixel square and at sixteen on
an eight. Growing a picture trims its frames to what still fits instead of
producing a document the device would refuse. The same rule holds for the
references a picture owns: renaming one retargets every layer that draws it,
removing frames clamps each layer's `sprite_frame`, and removing an ink remaps
the digits above it so surviving pixels keep their colour and the removed one
falls to clear. An editor action that made the document unsaveable would be a
worse failure than the missing feature was.

**Drawing got its own page.** Wiring is the pin and the shape, Layers is what
the device shows, and neither is where a picture is drawn — Pictures sits
between them, on a matrix only.

**A picture previews through the real painter.** Playing one builds a temporary
`sprite` layer and runs it through `paintOutput`, so the panel in the
application and the panel on the desk are drawn by the same code every other
layer uses; the second implementation this ADR already accepts is not
multiplied by a third. On the board it reuses the single-layer preview
unchanged, which is what makes drawing land on the physical panel while live
apply is on.

**Still no import.** No PNG, no GIF. A picture this size is drawn faster than it
is sourced, and importing one needs a decoder and a colour quantizer for
artwork that is sixty-four pixels. The three generators the flags profile uses
are offered as starting points instead, which is the part of an import that was
actually worth having.

## Amendment: a six-pixel face, and colours that answer telemetry (schema 24)

**The large face is six columns wide, not five.** `regular_5x8` and `bold_5x8`
become `regular_6x8` and `bold_6x8`, redrawn rather than padded. Five columns
was one short of what the round digits wanted: a `0` and an `8` closed on
themselves, and the bold weight had a single free column to thicken into, so it
differed from the regular one mostly in its horizontals. Six columns leave the
counters open at both weights and still fit an eight-pixel panel with a column
either side. Renaming the enum values is a breaking change to a public property,
so this is the schema bump; a stored record written against 23 is refused whole
and each document falls back to its factory payload, per ADR 0024. The
configurator migrates its own saved files, because a file it wrote is a file it
can read.

**A layer's colour may answer telemetry, and its ground with it.** `color_rules`
is a bounded list of `op`/`value`/`color`/`background_color`/`blink_ms`/`hold_ms`
over the layer's
`condition_source`, and it is deliberately **first-match-wins** — the one place
in this ADR where a layer resolves rather than composes, because these describe
one layer's appearance the way a widget's styling rules describe one widget.
Which of the four bands a value is in is one question with one answer; whether a
flag and a limiter are both showing is not. `color` repaints what the layer
draws — the ink of `text`, the colour of `solid` and `animation`, the fill of a
`gauge` with no ramp, and every lit pixel of a `sprite`, so one icon serves every
state rather than being drawn once per colour — black is left alone there, since
a black pixel is the unlit lamp by convention and tinting it would turn every
picture into its own bounding box. `background_color`, on the layer
or on a rule, fills the lamps the layer covers before it draws, which is what
lets a glyph sit on a ground of its own instead of on whatever the layers below
left.

**The layer still watches exactly one value.** The rules read
`condition_source`, the same binding the `conditions` gate reads, rather than
adding a second one. A gate and a colour are different questions about the same
fact — is the layer showing, and what colour is it — and a layer that wanted two
different values is two layers. The validator now requires that binding when
either the gate or a colour rule reads it, and rejects it when neither does, so
the rule that a binding never sits unread survives the addition. A rule that
would paint nothing at all — no colour, no background, no blink — is rejected for
the same reason.

**A rule carries its own timing, but not its own gate.** `hold_ms` keeps a rule
applied for a while after it stops matching and `blink_ms` flashes everything the
layer paints while it holds, the same two fields a widget's styling rule has and
for the same reason: what wants to flash is one *band* of a value, and a layer's
own `blink_ms` cannot say "only over 97%". A rule's blink takes over from the
layer's while it holds, and it runs from the moment the rule was applied rather
than from the gate, so the flash starts lit. What a rule still does not carry is
`hidden`: a rule that could stop the layer painting would be a second gate
wearing the clothes of a description, and the gate is one property up.

Holding makes resolution stateful — the layer remembers which rule it applied and
until when — which is the same shape the gate's own `hold_ms` already had, so the
per-layer state grew a struct rather than a mechanism. The document cost is
twenty bytes a rule, four rules in each of a hundred and twenty-eight layers:
`ApplicationConfiguration` grows 11 KB, from 389,628 bytes to 400,892, doubled by
the active/scratch pair.

**The preview walks the rules rather than guessing a value.** With no game
attached there is no watched value, so the configurator's preview holds each
rule's own threshold in turn for a beat and then holds nothing, which shows the
authored colour and every rule in order whatever operator each one uses; a rule
with a `hold_ms` keeps its colour that far into the following beat, which is what
the hold does on the board. A gear
readout cycles `R`, `N` and 1 to 9 on its own beat for the same reason: the sweep
that drives a bar says nothing about what a glyph should spell. Both are preview
data and neither reaches the board — a layer bound to telemetry previews on the
desk only when a game is feeding it.
