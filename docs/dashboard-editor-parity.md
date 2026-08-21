# Dashboard editor parity (SimCore vs SimHub)

An analysis of what the SimCore configurator still lacks to author dashboards
the way the SimHub editor does. This is a status report rather than a plan; the
items that have been accepted for work live in [roadmap.md](roadmap.md).

Sources for the current state: [configuration-schema.md](configuration-schema.md)
(the contract), [device-configuration.md](device-configuration.md) (the rules
around it) and `configurator/src/renderer/src/features/configuration/` (the
editor).

## What exists

- Widget types `text`, `shape`, `slot`, `bar`, `arc`, `indicator`, `graph` and
  `image`.
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
- Fonts: chosen from a library of bundled faces, Google Fonts and imported
  files; one face per family, any `size_px` rasterized on the board without a
  reboot, and delivery handled by saving rather than by a separate upload step.
- Uploaded images, converted in the configurator to the layout and the size the
  device draws.
- Up to four screens, swiped between on a board with a touch panel, or reached by
  a tap on a widget or on an area authored as a touch zone.
- Container shapes: a shape whose widgets are placed relative to it, nest inside
  it and are clipped to it unless the shape says otherwise, and slots, an area
  holding pages of widgets that share one box with one shown at a time — cycled
  by a tap, or raised for a time by a telemetry trigger.
- Live apply rebuilds the dashboard on a connected board without writing flash
  and without a reboot — SimHub has no direct equivalent.

## Gaps

### 1. Widget types

Available: `text`, `shape`, `slot`, `bar`, `arc`, `indicator`, `graph` and
`image`.
There is no dedicated delta widget any more: a delta is authored from a text
widget with a signed transform plus a bar with a centred `origin`.
Missing: tables, and a track map. The map is not an uploaded asset: SimHub
already generates the outline, so it travels the link once per track and the
device keeps it in RAM, with the car placed on it by `track.position_percent` —
the only positional field the catalog carries. That makes it the first payload
that is neither a telemetry line nor an asset package: what SimHub can be made
to emit, how the outline is encoded, and when it is dropped (a track change) are
the ADR's questions.

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
time through a tab strip, which also reorders them by dragging and renames them
in place. The tabs carry the screens' names rather than their positions — a
`goto_screen` action addresses a screen by name anyway, and a position is the
one label that means something different after a drag, which is precisely when
the strip has to be readable. Navigation is
not authorable: the order is the order the screens are declared in and it wraps
at both ends, so there is nothing in the contract for it beyond that order.

It rests on the input subsystem that arrived with it: a GT911 pointer behind a
new `interfaces/input` contract on both Guition boards
([ADR 0019](adr/0019-input-interface-and-touch.md)). **The T-Display-S3 has no
digitizer**, so on that board a second screen is authored, validated, and never
reachable. Buttons and encoders are still owed.

A tap navigates as well: any widget may carry `next_screen`, `previous_screen`
or `goto_screen`, and an empty transparent shape is an invisible touch zone. The order of the screens, the swipe and the transition stay unauthored.

Missing: authored transitions, vertical navigation, and switching a screen from
telemetry.

### 5. Graphical assets

Available: a 4 MiB `image_assets` partition, the `SCIA` format, upload over the
same `SCF1` frames under the `@SC:IMAGE:` namespace, conversion in the
configurator (RGB565 / RGB565A8 / A8) and the `image` widget
([ADR 0018](adr/0018-uploaded-image-assets.md), [image-assets.md](image-assets.md)).
The device decodes nothing: an image arrives in the layout and at the size it is
drawn at.

The stored pixels are deflated and inflated once at startup, so what the artwork
costs lands on flash rather than on the frame: real dashboard artwork stores at a
fifth to a third of raw, and the draw path is byte for byte what it was.

Sprite sheets exist: one entry holds several pictures of one geometry, and a
widget draws whichever frame it is asked for, chosen outright or from telemetry.
Frames are uniform and stored whole rather than packed as rectangles, because
whole frames are the only layout contiguous in every colour format — which is
what keeps a frame change a pointer step and leaves the accelerated blit alone.

Missing: keeping an image in the format it was authored in —
a PNG or an SVG the device decodes and scales itself, so one upload serves every
size and a layout transfer carries it. That last one is the opposite of the
decision ADR 0018 took, and needs its own. An indexed palette was on this list
and is not any more: it is excluded by decision, because LVGL expands an indexed
image to ARGB8888 a line at a time on every repaint and cannot hand it to the
P4 accelerator, so it would trade frames for storage that compression already
gives back.

### 6. Editor UX

Available: undo/redo with a whole gesture grouped into one entry,
copy/paste/duplicate (the clipboard is JSON, so it crosses projects), arrow-key
nudging, keyboard deletion, multi-select by rubber band and Shift, alignment and
even distribution, zoom with panning, restacking from the keyboard, and a layer
panel with folding, drag reordering, drag reparenting — dropping a row onto the
middle of a container's row moves the widget inside it, and a slot lists every
page so a drop can reach one the canvas is not showing — renaming and lock/hide.

A widget is created by drawing it. The tools sit in a column beside the canvas,
one is picked, and a box dragged on the display becomes the widget — at that
size, in that place, and inside whatever container the box landed in; a click
without a drag places the kind's own size at the pointer. The tool is one-shot,
so the next press edits again. The same kinds are a right-click away: the
context menu on the canvas adds, pastes and selects, the one on a widget carries
duplicate, delete, wrap, restack, lock and hide, and the layer list opens the
same menu with renaming added, since it is the one place that can rename inline.

Snapping is one engine for a move, a resize and a drawn corner, and it answers
in one order: an edge or centre of a neighbour first, then a gap the row already
has, then the grid. What it lines up with is the level the box is in — its own
siblings, its container's box and the area inside its padding — resolved while
the drag runs, so a widget dragged into a panel starts lining up with that
panel's contents the moment it is over them. A resized edge reaches for all of
it, which is the part that used to be missing: an edge could only find the grid,
so a box could be dragged to within a pixel of the neighbour it was meant to
meet and left there. Guides cover only the boxes they relate rather than
crossing the display, gaps are drawn with their measurements, the widget that
was matched is outlined, and a badge beside the pointer carries the position or
the size. Holding `Cmd`/`Ctrl` drops the neighbours and keeps the grid — the
same key that already means "leave this widget in the container it is in" — and
adding `Shift` drops the grid too. The grid is on by default at a step chosen
for the board, and how far a box reaches for a line is a setting; both are kept
across restarts.

A resize acts on one widget or on the box around the whole selection, which
scales every member and the space between them. `Shift` keeps the proportions
and `Alt` grows from the centre. Whether a container carries its contents is a
mode rather than a held key — the four modifier combinations a resize already
answers to leave nothing free — and with it on the whole subtree scales, fonts,
radii and thicknesses included, through the same tables a cross-board transfer
uses.

Three of those come straight from what SimHub's editor documents and SimCore had
no equivalent for: reordering screens by dragging their tabs, `Ctrl+S` to save
the dashboard — to a file, since saving to the board delivers fonts and restarts
it — and `Ctrl+Alt` with the arrows to resize the selection. `Ctrl+A`, `Ctrl+Z`,
the arrows and `Del` were already bound, and the padlock that lets a click reach
what is under a locked component is what our lock has always done. SimHub's zoom
slider ended up under the canvas rather than over it, in a status bar beside the
snapping switches and the selected widget's box: the canvas zooms at the pointer
with the wheel and pans with Space or with the wheel alone, and a panel over the
display would cover the thing being judged. The zoom is a factor over "the whole
display fits the canvas" — the surface always scales to the space it has — and
it goes below one to one as well as above it.

Containers, on the other hand, are worked with the way they are in Figma and
Sketch rather than the way SimHub does it, because SimHub has no containers to
copy: its Dash Studio is
one flat component list per screen, with a padlock that lets a click reach what
is underneath (which is what our lock already does). So a click picks the
outermost container, double-click opens one, `Cmd`/`Ctrl`-click deep-selects,
`Escape` walks back up, and a widget joins a container by being dragged into it
on the canvas — with `Cmd`/`Ctrl` held to keep the current parent. A new,
duplicated or pasted widget lands in the container being worked in.

Grouping is done, but not as this section predicted: it is a document entity
rather than an editor annotation, because the device needs it. A container is a
rectangle of a screen with its widgets authored inside it, relative to its box,
and a **slot** is an area holding pages that occupy its box one at a time — the
SimHub "dashboard area switch". A tap cycles the pages in the loop, and a page
whose telemetry trigger fires is raised over them for a bounded time
([ADR 0021](adr/0021-widget-groups-and-slots.md)).

Missing: nothing structural. What is left here is polish — keyboard sibling
navigation (`Tab`, `Enter`) and a search over the layer list.

The rest of this section is pure configurator work: no schema and no firmware
changes.
Editor state (locks, hiding, grid, zoom) deliberately stays out of the document:
the validator rejects unknown properties, and a hidden layer is not a hidden
widget.

### 7. Preview values

The canvas shows no values, because the configurator has none: every source
reads unavailable, so each one draws its own placeholder and a widget with an
`unavailable_text` draws that instead. That is a state the dashboard really has
rather than a stand-in for one, and it is the state `unavailable_text` and a
hiding rule exist for. Value formatting mirrors the firmware, including
half-away-from-zero rounding, so the placeholder and the affixes around it are
the strings the board draws.

What this costs is that conditional rules and the colour ramp cannot be seen
reacting: no reading means no rule matches, so the canvas shows the authored
appearance. A graph shows the frame and a baseline rather than a trace, and an
indicator shows its unlit lamps. The configurator previously invented a
synthetic lap to fill the gap; a value the game never sent is judged as though
it had, and the shape of the real signal is the one thing the configurator
cannot know.

Geometry mirrors it too. Every widget type draws into the container's **content
area** — the placement less the border and the padding — the way LVGL positions
a child; the shared frame (background, inset background, gradient, border) is
drawn for every type rather than only the ones that started with it; the
indicator divides its strip in whole pixels and leaves an unlit lamp
transparent without an `off_color`; and a widget's own box clips its contents,
so an overlong value is cut off here as it is on the board. A container clips
what it holds, caption included, exactly as `clip_children` says — the one thing
the canvas leaves unclipped is the invisible hit area, so a widget dragged out of
a container stays selectable instead of becoming unreachable; it is drawn as a
faint outline where it went. A widget's own caption stays outside its own clip
because the device puts it on the parent, where it overhangs the frame; it is placed by the same rule the device uses — anchored to an edge
of the widget's outer box, moved by the offsets, with the border line cut on
whichever band its padded box crosses — including the same whole-pixel
truncation, so the cut lands on the same pixels in both.

Text and images are drawn with the assets themselves. Faces come from the
configurator's font library and converted bitmaps from the copy it keeps of what
it installs, so the canvas measures strings with the face the board rasterizes
and lays the label out the way LVGL does — sized to its text, anchored in whole pixels, drawn from its
baseline — and an `image` widget shows its bitmap, already resized and already
reduced to its colour format, centred at its own size. What remains is the
rasterizer: the browser hints and antialiases differently from LVGL's TinyTTF,
so the preview matches the board's layout rather than its pixels. A font carries
across machines, because the family identifier names a library entry any
installation can resolve; an *imported* face and an image uploaded elsewhere do
not, and fall back to a stand-in face and a named box.

Live telemetry is accepted for work, but not by asking the board for it: `@SC:`
has no command for reading values, and while a session is running the port
belongs to SimHub. The direction is to put the configurator in the middle — a
virtual COM port on the PC that SimHub sends to, with the configurator drawing
the stream on the canvas and forwarding it on to the board — so the same values
reach both, and the canvas shows conditional rules, ramps, graph traces and real
string lengths reacting.

### 8. Templates and portability

A dashboard moves between boards in one action, and a new one starts from a
library rather than from an empty screen. The library holds the starters that
ship with the application beside whatever the author has saved, one file each
under the user data directory; a template is a whole configuration document
inside an envelope that carries its name, because the document itself may hold
nothing the contract does not declare.

Moving a layout scales every pixel-valued property, and the author chooses how
it lands. **Keep proportions** applies the smaller of the two display ratios to
both axes and centres the result, so nothing distorts and a display of a
different shape keeps a margin. **Stretch to fill** gives each axis its own
ratio, so the layout uses the whole display and round shapes become oval. A font
size, a corner radius and a ring thickness follow the smaller ratio under both,
because a glyph has one size. Neither reflows: no widget moves relative to its
neighbours.

The choice matters more than it sounds. A 1024×600 race layout contained onto a
480×480 board covers 56% of it and stretched covers 96%. Contain is the default,
because it is the one that cannot distort.

One engine serves both entry points — "Convert draft to <board>" and applying a
template authored for another board. What did not carry cleanly is reported
rather than left to be discovered, and the result is checked against the
destination before it replaces anything ([ADR 0023](adr/0023-dashboard-templates-and-layout-transfer.md)).

What a transfer still cannot do: reflow. Neither fit rearranges anything, so a
layout that wants a different arrangement on a differently shaped display is
hand work; reflow is accepted for work. Image assets do not follow either — the board draws a bitmap at the size it was uploaded at
([ADR 0018](adr/0018-uploaded-image-assets.md)) — so the report names each one
and the size it now needs. A template is a whole dashboard or a single widget,
and one screen of a saved dashboard can be added to the open one — it arrives as
a new screen at the end rather than replacing anything, transferred to this board
like any other layout. What is left is saving a screen on its own, and sharing a
template as a file without going through the user data folder.

### 9. Style details

Bold and italic are separate families, because a family is uploaded as a single
face file.

## Deliberate limitations

Rotation, shadows and auto-fitting text to its box are excluded by decision
rather than deferred. Only `lv_image` can rotate and doing so disables the PPA on the ESP32-P4, so a rotated image is
prepared during conversion; a shadow is a per-frame blur in direct mode; and
auto-fitting fights glyph pre-warming ([ADR 0010](adr/0010-uploaded-font-assets.md)),
so a widget reports the size it needs instead.

Transparency was on this list and is not any more: colours stay opaque
`#RRGGBB` today, and the obstacle is the encoding rather than the feature —
packing `#RRGGBBAA` would make `#FFFFFFFF` indistinguishable from the
`kTransparentColor` sentinel every optional colour uses for "unset". An
alpha that keeps those apart is what the work is.

The per-class widget caps for the dashboard, 3 sources per widget, 15-byte
strings and 4 modifiers per source are embedded-system limits rather than
unfinished work. `kMaximumWidgetsPerScreen` equals the sum of the per-class
caps, so there is no separate per-screen limit. The caps themselves live in
[configuration-schema.md](configuration-schema.md), which is generated from the
contract — repeating them here is what let this paragraph claim 24 shapes
against a real cap of 32 and omit slots altogether, breaking the sum it
asserts. The 64 KB payload and documents in PSRAM are no
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
   groups and slots in schema 6, tap-driven navigation in schema 7, and
   containers replacing groups in schema 9
   (ADRs 0019, 0020, 0021).
7. ~~**Cross-board layout transfer and a template library**~~ Done: the bundled
   and saved template library, and the contain-or-stretch scale that both
   applying a template and converting a draft share
   ([ADR 0023](adr/0023-dashboard-templates-and-layout-transfer.md)).
8. **Preview with live values** — the virtual COM port the configurator sits
   behind. It comes first among what is left because it is what makes the rest
   judgeable: a rule, a ramp, a graph trace and a real string length cannot be
   checked against a placeholder.
9. **The editor's remaining reach** — saving a single screen, a template as a
   file, and a gallery to start from. Configurator only, no schema and no
   firmware.
10. **Transparency** — cheap to author and cheap to draw; the work is an alpha
    encoding that still leaves the `kTransparentColor` sentinel meaning "unset".
11. **Images that survive a move** — an original-format asset the device scales,
    and reflow in the transfer. The two together are what makes a dashboard
    portable rather than merely resized.
12. **Table and track map** — the widget types still missing. Firmware work:
    an LVGL implementation, a descriptor and a schema entry each, and the map
    also needs the one-shot outline message and somewhere to hold it.
