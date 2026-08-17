# Dashboard editor parity (SimCore vs SimHub)

An analysis of what the SimCore configurator still lacks to author dashboards
the way the SimHub editor does. This is a status report rather than a plan; the
items that have been accepted for work live in [roadmap.md](roadmap.md).

Sources for the current state: [configuration-schema.md](configuration-schema.md)
(the contract), [device-configuration.md](device-configuration.md) (the rules
around it) and `configurator/src/renderer/src/features/configuration/` (the
editor).

## What exists

- Widget types `text`, `shape`, `bar`, `arc`, `indicator`, `graph` and `image`.
- Absolute geometry in logical pixels, drag and resize on the preview, stacking
  by `z_index`.
- A schema-backed inspector plus an advanced JSON editor over the same draft
  document.
- Up to three sources per text widget from the generated telemetry catalog (227
  fields), rendered in order into one string. Each source has its own bounded
  modifier list — `lap_timer` is the only modifier — and its own optional
  transform: `time` for durations, `number` for precision, scale, offset and
  units. Prefix and suffix belong to the transform itself, so they work without
  one, and they are what separates neighbouring sources.
- Conditional styling rules on every widget with a frame: up to four rules over
  one field the widget need not display, setting content colour, background,
  border colour, hiding and blinking.
- Value-driven colour ramps (up to four stops over the same watched source) and
  linear gradients for the frame background and the bar fill.
- Fonts: one uploaded face per family, and any `size_px` is rasterized on the
  board without a reboot.
- Uploaded images, converted in the configurator to the layout and the size the
  device draws.
- Up to four screens, swiped between on a board with a touch panel, or reached by
  a tap on a widget or on an area authored as a touch zone.
- Widget groups: a rectangle of a screen whose widgets are placed relative to
  it, and slots, where several groups share one box and one is shown at a time —
  cycled by a tap, or selected by a telemetry rule.
- Live apply rebuilds the dashboard on a connected board without writing flash
  and without a reboot — SimHub has no direct equivalent.

## Gaps

### 1. Widget types

Available: `text`, `shape`, `bar`, `arc`, `indicator`, `graph` and `image`.
There is no dedicated delta widget any more: a delta is authored from a text
widget with a signed transform plus a bar with a centred `origin`.
Missing: tables.

Every type needs an LVGL implementation, a compile-time descriptor per
[ADR 0015](adr/0015-widget-descriptors.md) and an entry in the schema. That is
firmware work; the configurator follows the generated contract.

### 2. Formulas and expressions over telemetry

The value pipeline is up to three sources per widget, each with its own
modifier list and its own transform. Linear arithmetic is covered: the `number`
transform provides decimals, a multiplier and an offset, which is also how unit
conversion works (km/h → mph, °C → °F, kPa → psi), and unit names live only in
the configurator. Composing several fields into one string is covered too:
`P 3/24` is a position source and a participant-count source with a `/` prefix,
with no format string involved
([ADR 0012](adr/0012-value-bindings-and-time-transforms.md)). Missing:

- conditional expressions.

SimHub solves this with NCalc and JavaScript formulas on any property. An
interpreter in the firmware contradicts the "no allocation in the periodic path"
rule, so the direction is the one that produced `number`: declarative bounded
transforms. This needs an explicit decision (an ADR) before implementation.

### 3. Conditional and animated styling

Colour by threshold, hiding by condition and blinking all exist. The rules live
on `WidgetFrame`, so every widget with a frame has them. A widget watches one
telemetry field (independent of what it displays) and carries up to four rules;
the first one that matches sets content colour, background, border colour,
visibility and blink period, and everything it leaves unset stays as authored
([ADR 0017](adr/0017-conditional-widget-styling.md)). What "content colour"
means is the widget type's own business: text paints its label, a bar its fill.
Under the rules sits a colour ramp: up to four stops over the same source, with
the colour interpolated between them — a matching rule paints over it. Linear
gradients exist as well (frame background and bar fill). Missing: animation
curves and triggers.

### 4. Multiple screens and navigation

Done. `kMaximumScreens` is 4 and the driver swipes between them
([ADR 0020](adr/0020-screen-navigation.md)); the editor authors one screen at a
time through a tab strip. Navigation is not authorable: the order is the order
the screens are declared in and it wraps at both ends, so there is nothing in
the contract for it.

It rests on the input subsystem that arrived with it: a GT911 pointer behind a
new `interfaces/input` contract on both Guition boards
([ADR 0019](adr/0019-input-interface-and-touch.md)). **The T-Display-S3 has no
digitizer**, so on that board a second screen is authored, validated, and never
reachable. Buttons and encoders are still owed.

A tap navigates as well: a widget or a group may carry `next_screen`,
`previous_screen` or `goto_screen`, and an empty group is an invisible touch
zone. The order of the screens, the swipe and the transition stay unauthored.

Missing: authored transitions, vertical navigation, and switching a screen from
telemetry.

### 5. Graphical assets

Available: a 4 MiB `image_assets` partition, the `SCIA` format, upload over the
same `SCF1` frames under the `@SC:IMAGE:` namespace, conversion in the
configurator (RGB565 / RGB565A8 / A8) and the `image` widget
([ADR 0018](adr/0018-uploaded-image-assets.md), [image-assets.md](image-assets.md)).
The device decodes nothing: an image arrives in the layout and at the size it is
drawn at.

Missing: an indexed palette (the format accepts one, but the configurator does
not quantize yet) and sprite atlases.

### 6. Editor UX

Available: undo/redo with a whole gesture grouped into one entry,
copy/paste/duplicate (the clipboard is JSON, so it crosses projects), arrow-key
nudging, keyboard deletion, multi-select by rubber band and Shift, alignment and
even distribution, snapping to a grid and to neighbouring edges with guides,
zoom with panning, and a layer panel with drag reordering, renaming and
lock/hide.

Grouping is done, but not as this section predicted: it is a document entity
rather than an editor annotation, because the device needs it. A group is a
rectangle of a screen with its widgets authored inside it, relative to its box,
and groups sharing a **slot** occupy that box one at a time — the SimHub
"dashboard area switch". A tap cycles the slot and a telemetry rule overrides
that while it matches ([ADR 0021](adr/0021-widget-groups-and-slots.md)).

Missing: dragging a widget between groups on the canvas, and restacking across
parents.

The rest of this section is pure configurator work: no schema and no firmware
changes.
Editor state (locks, hiding, grid, zoom) deliberately stays out of the document:
the validator rejects unknown properties, and a hidden layer is not a hidden
widget.

### 7. Preview with live values

A playback mode exists: the canvas runs a synthetic lap in which the fields are
coherent with each other (speed follows gear, engine speed follows gear), with
pause and scrubbing, plus a separate "no data" mode for checking
`unavailable_text`. Value formatting mirrors the firmware, including half-away-
from-zero rounding, so the preview shows the same strings the board does.
Conditional rules and the colour ramp are evaluated there as well.

Geometry mirrors it too. Every widget type draws into the container's **content
area** — the placement less the border and the padding — the way LVGL positions
a child; the shared frame (background, inset background, gradient, border) is
drawn for every type rather than only the ones that started with it; the
indicator divides its strip in whole pixels and leaves an unlit lamp
transparent without an `off_color`; and a widget's own box clips its contents,
so an overlong value is cut off here as it is on the board. The caption stays
outside that clip because the device puts it on the parent, where it overhangs
the frame; it is placed by the same rule the device uses — anchored to an edge
of the widget's outer box, moved by the offsets, with the border line cut on
whichever band its padded box crosses — including the same whole-pixel
truncation, so the cut lands on the same pixels in both.

Text and images are drawn with the uploaded assets themselves. The configurator
keeps a copy of every face and every converted bitmap it installs, so the canvas
measures strings with the face the board rasterizes and lays the label out the
way LVGL does — sized to its text, centred in whole pixels, drawn from its
baseline — and an `image` widget shows its bitmap, already resized and already
reduced to its colour format, centred at its own size. What remains is the
rasterizer: the browser hints and antialiases differently from LVGL's TinyTTF,
so the preview matches the board's layout rather than its pixels. An asset
uploaded from another machine has no local copy, and falls back to a stand-in
face and a named box.

Live telemetry from the game does not exist and is not planned: `@SC:` has no
command for reading values, and while a session is running the port belongs to
SimHub.

### 8. Templates and portability

There is no dashboard template library and no way to move a dashboard between
boards. Geometry is absolute pixels, so a 320×170 layout has to be redone by
hand for 1024×600.

### 9. Style details

Bold and italic are separate families, because a family is uploaded as a single
face file.

## Deliberate limitations

Transparency (colours stay opaque `#RRGGBB`), rotation, shadows and auto-fitting
text to its box are excluded by decision rather than deferred. Transparency is
not needed by the product, and packing `#RRGGBBAA` would make `#FFFFFFFF`
indistinguishable from the `kTransparentColor` sentinel; only `lv_image` can
rotate and doing so disables the PPA on the ESP32-P4, so a rotated image is
prepared during conversion; a shadow is a per-frame blur in direct mode; and
auto-fitting fights glyph pre-warming ([ADR 0010](adr/0010-uploaded-font-assets.md)),
so a widget reports the size it needs instead.

The per-class widget caps for the dashboard (32 text, 24 shape, 16 bar, 8 arc,
4 indicator, 2 graph, 8 image), 3 sources per widget, 15-byte strings and 4
modifiers per source are embedded-system limits rather than unfinished work.
`kMaximumWidgetsPerScreen` equals the sum of the per-class caps, so there is no
separate per-screen limit. The 64 KB payload and documents in PSRAM are no
longer the bottleneck; what still is, is internal RAM for widget state, so
raising a particular cap is a decision about the RAM budget.

## Recommended order

1. ~~**Number formatting** — decimals, multiplier and offset, units.~~
   Done: the `number` transform.
2. ~~**Conditional colour and visibility** — covers rev lights, warnings,
   ABS/TC.~~ Done: styling rules on the widget.
3. ~~**Bar, arc/gauge, indicator strip**~~ Done, plus `shape` and `graph`.
4. ~~**Editor UX**~~ Done.
5. ~~**Images**~~ Done: the uploaded image pipeline and the `image` widget.
6. ~~**Multiple screens**~~ Done, with the touch input it needed and with widget
   groups and slots in schema 6, and tap-driven navigation in schema 7
   (ADRs 0019, 0020, 0021).
7. **Cross-board layout transfer and a template library** — the largest
   remaining difference for a user, and the one item on this list that needs no
   firmware.
