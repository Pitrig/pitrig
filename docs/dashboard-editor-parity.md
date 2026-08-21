# Dashboard editor parity (SimCore vs SimHub)

What the SimCore configurator still cannot do that the SimHub editor can, and
what is excluded on purpose. This is a gap list rather than a plan; the items
accepted for work live in [roadmap.md](roadmap.md), and what the editor already
does is described in [device-configuration.md](device-configuration.md) and the
generated [configuration-schema.md](configuration-schema.md) rather than
repeated here.

## Gaps

### 1. Widget types

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

Linear arithmetic and multi-field composition are covered by the `number`
transform and the ordered `sources` array
([ADR 0012](adr/0012-value-bindings-and-time-transforms.md)). Missing:
conditional expressions.

SimHub solves this with NCalc and JavaScript formulas on any property. An
interpreter in the firmware contradicts the "no allocation in the periodic path"
rule, so the direction is the one that produced `number`: declarative bounded
transforms. This needs an explicit decision (an ADR) before implementation.

### 3. Conditional and animated styling

Threshold rules, colour ramps, gradients, hiding and blinking are all in the
contract ([ADR 0017](adr/0017-conditional-widget-styling.md)). Missing:
animation curves and triggers.

### 4. Multiple screens and navigation

Up to four screens, swiped between and reachable by a tap
([ADR 0020](adr/0020-screen-navigation.md)). Two constraints on it are worth
stating: **the T-Display-S3 has no digitizer**, so on that board a second screen
is authored, validated and never reachable; and buttons and encoders are still
owed on every board ([ADR 0019](adr/0019-input-interface-and-touch.md)).

Missing: authored transitions, vertical navigation, and switching a screen from
telemetry.

### 5. Graphical assets

Uploaded images, sprite sheets and the `image` widget are in
([ADR 0018](adr/0018-uploaded-image-assets.md),
[image-assets.md](image-assets.md)); the device decodes nothing, so an image
arrives in the layout and at the size it is drawn at.

Missing: keeping an image in the format it was authored in — a PNG or an SVG
the device decodes and scales itself, so one upload serves every size and a
layout transfer carries it. That is the opposite of the decision ADR 0018 took,
and needs its own.

An indexed palette is excluded rather than missing: LVGL expands an indexed
image to ARGB8888 a line at a time on every repaint and cannot hand it to the
P4 accelerator, so it would trade frames for storage that compression already
gives back.

### 6. Editor UX

Nothing structural is missing; what is left is polish — keyboard sibling
navigation (`Tab`, `Enter`) and a search over the layer list. Both are pure
configurator work: no schema and no firmware change.

Two deliberate divergences from SimHub are worth recording, because they are
choices rather than gaps. **Containers** are worked with the way they are in
Figma and Sketch, since SimHub has nothing to copy: its Dash Studio is one flat
component list per screen. So a click picks the outermost container,
double-click opens one, `Cmd`/`Ctrl`-click deep-selects, `Escape` walks back
up, and a widget joins a container by being dragged into it
([ADR 0021](adr/0021-widget-groups-and-slots.md)). And SimHub's **zoom slider**
sits under the canvas here rather than over it, in a status bar beside the
snapping switches: a panel over the display would cover the thing being judged.

Editor state — locks, hiding, grid, zoom — deliberately stays out of the
document: the validator rejects unknown properties, and a hidden layer is not a
hidden widget.

### 7. Preview values

The canvas shows no values, because the configurator has none: every source
reads unavailable, so each one draws its own placeholder and a widget with an
`unavailable_text` draws that instead. That is a state the dashboard really has
rather than a stand-in for one, and it is the state `unavailable_text` and a
hiding rule exist for.

What it costs is that conditional rules and the colour ramp cannot be seen
reacting: no reading means no rule matches, so the canvas shows the authored
appearance. A graph shows the frame and one baseline per trace rather than the
traces themselves, and an indicator shows its unlit lamps. Inventing a value
would be worse — a signal the game never sent, judged as though it had.

Geometry and assets are already mirrored: the canvas lays out the way LVGL
does, measures strings with the face the board rasterizes, and draws an image
from the converted bitmap. What remains is the rasterizer — the browser hints
and antialiases differently from LVGL's TinyTTF, so the preview matches the
board's layout rather than its pixels — and an *imported* face or an image
uploaded on another machine, which fall back to a stand-in face and a named box.

Missing: live values. Not by asking the board for them — `@SC:` has no command
for reading values, and while a session is running the port belongs to SimHub.
The direction is to put the configurator in the middle: a virtual COM port on
the PC that SimHub sends to, with the configurator drawing the stream on the
canvas and forwarding it on to the board, so the same values reach both.

### 8. Templates and portability

A dashboard moves between boards in one action and a new one starts from a
template library, scaled by keep-proportions or stretch-to-fill
([ADR 0023](adr/0023-dashboard-templates-and-layout-transfer.md)).

Missing: **reflow.** Neither fit rearranges anything, so a layout that wants a
different arrangement on a differently shaped display is hand work. Image
assets do not follow a transfer either — the board draws a bitmap at the size it
was uploaded at ([ADR 0018](adr/0018-uploaded-image-assets.md)) — so the report
names each one and the size it now needs. Also missing: saving a single screen
on its own, and sharing a template as a file rather than through the user data
folder.

### 9. Style details

Bold and italic are separate families, because a family is uploaded as a single
face file.

## Deliberate limitations

Rotation, shadows and auto-fitting text to its box are excluded by decision
rather than deferred. Only `lv_image` can rotate and doing so disables the PPA on the ESP32-P4, so a rotated image is
prepared during conversion; a shadow is a per-frame blur in direct mode; and
auto-fitting fights glyph pre-warming ([ADR 0010](adr/0010-uploaded-font-assets.md)),
so a widget reports the size it needs instead.

Transparency is deferred rather than excluded: colours stay opaque `#RRGGBB`
today, and the obstacle is the encoding rather than the feature — packing
`#RRGGBBAA` would make `#FFFFFFFF` indistinguishable from the
`kTransparentColor` sentinel every optional colour uses for "unset". An alpha
that keeps those apart is what the work is.

The bounded caps — per widget type, per source list, per modifier list, per
string — are embedded-system limits rather than unfinished work. Their values
live in [configuration-schema.md](configuration-schema.md), which is generated
from the contract, and are deliberately not repeated here. The 64 KB payload
and documents in PSRAM are no longer the bottleneck; internal RAM for widget
state is, so raising a particular cap is a decision about the RAM budget.

## Recommended order

1. **Preview with live values** — the virtual COM port the configurator sits
   behind. It comes first because it is what makes the rest judgeable: a rule, a
   ramp, a graph trace and a real string length cannot be checked against a
   placeholder.
2. **The editor's remaining reach** — saving a single screen, a template as a
   file, and a gallery to start from. Configurator only, no schema and no
   firmware.
3. **Transparency** — cheap to author and cheap to draw; the work is an alpha
   encoding that still leaves the `kTransparentColor` sentinel meaning "unset".
4. **Images that survive a move** — an original-format asset the device scales,
   and reflow in the transfer. The two together are what makes a dashboard
   portable rather than merely resized.
5. **Table and track map** — the widget types still missing. Firmware work:
   an LVGL implementation, a descriptor and a schema entry each, and the map
   also needs the one-shot outline message and somewhere to hold it.
