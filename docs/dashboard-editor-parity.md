# Dashboard editor parity (Pitrig vs SimHub)

What the Pitrig configurator still cannot do that the SimHub editor can, and
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

Neither waits on a widget, though: `<id>;<value>` addresses one scalar, so there
is nothing for a table to iterate and nothing to carry an outline. A runtime
repeater is refused — it costs the per-instance lifecycle ADR 0015 deliberately
does not have. What replaces it is a bounded relative: N cars ahead and N behind
plus the leader, as flat fields the plugin sorts, leaving protocol, pools and
read path untouched. A twenty-car tower is the price. Roadmap Phase 7.

### 2. Formulas and expressions over telemetry

Linear arithmetic and multi-field composition are covered by the `number`
transform and the ordered `sources` array
([ADR 0012](adr/0012-value-bindings-and-time-transforms.md)). Missing:
conditional expressions.

SimHub solves this with NCalc and JavaScript formulas on any property. An
interpreter in the firmware contradicts the "no allocation in the periodic path"
rule, so the direction is the one that produced `number`: declarative bounded
transforms. The shape is decided and owed an ADR — a fixed set of stateless
nodes (`min`, `max`, `clamp`, `abs`, two sources combined, and a threshold that
selects between two values), evaluated identically by the configurator so the
canvas agrees with the board.

Stateless is the whole of it: stint timers, counters, rolling averages and
best-lap memory stay on the PC, and `lap_timer` is the one stateful modifier
because it extrapolates rather than derives.

### 3. Conditional and animated styling

Threshold rules, colour ramps, gradients, hiding and blinking are all in the
contract ([ADR 0017](adr/0017-conditional-widget-styling.md)).

Animation curves and triggers are excluded rather than missing. LVGL's `lv_anim`
would cost nothing to reach, but an authored animation invalidates its widget on
every frame for as long as it runs, and the render skip that keeps a dense
dashboard at 60 fps is worth more than a fade. Motion comes from telemetry:
`dashboard.smoothing`, `blink_ms`, and a sprite frame read from a source.

### 4. Multiple screens and navigation

Up to four screens, swiped between and reachable by a tap
([ADR 0020](adr/0020-screen-navigation.md)). Two constraints on it are worth
stating: **the T-Display-S3 has no digitizer**, so on that board a second screen
is authored, validated and never reachable; and buttons and encoders are still
owed on every board ([ADR 0019](adr/0019-input-interface-and-touch.md)).

A dashboard says whether a move between screens slides or lands in one frame;
which of the two it is is the whole of the authored transition.

Missing: a per-screen or per-move transition, a duration for it, vertical
navigation, and switching a screen from telemetry. The last of those is the one
that matters most: a slot page can be raised by a condition and a screen cannot,
so a single document covering several cars is authored around slots instead.

Buttons, switches and encoders stop being owed and become planned, and a button
and a slider drawn on the glass join them: a board is a controller as well as a
display, and the sim is meant to see it as a plain USB gamepad. That puts GPIO,
the bus service and the generalisation of `interfaces/input` on the critical
path, and gives the 32-button HID descriptor ADR 0029 already spent flash on
something to send. It also gives the T-Display-S3 a way to reach its second
screen. Nothing analog is planned — no potentiometers, no pedal or handbrake
axes — so a control is a button, a switch, an encoder, or a touch widget.

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

The canvas draws the live stream when there is one. The configurator goes in the
middle of the link: the [SimHub plugin](simhub-plugin.md) sends it the telemetry
over a local socket, it forwards every byte to the board unchanged, and it
decodes the same bytes on the way past
([ADR 0034](adr/0034-configurator-telemetry-bridge.md)). Taking the stream is
what lets a dashboard be adjusted while a session runs, which one process owning
one link otherwise forbids. Asking the board was never an option — `@PR:` has no
command for reading values.

With the bridge stopped, every source reads unavailable, so each one draws its
own placeholder, exactly as the board does before its first telemetry line; an
`unavailable_text` appears once a running stream leaves the widget without a
value. That is a state the dashboard really has rather than a stand-in for one,
and it is the state a hiding rule exists for. What it costs is that
conditional rules and the colour ramp cannot be seen reacting: no reading means
no rule matches, so the canvas shows the authored appearance, a graph shows the
frame and one baseline per trace, and an indicator shows its unlit lamps.
Inventing a value silently would be worse — a signal the game never sent, judged
as though it had.

Geometry and assets are already mirrored: the canvas lays out the way LVGL
does, measures strings with the face the board rasterizes, and draws an image
from the converted bitmap. What remains is the rasterizer — the browser hints
and antialiases differently from LVGL's TinyTTF, so the preview matches the
board's layout rather than its pixels — and an *imported* face or an image
uploaded on another machine, which fall back to a stand-in face and a named box.

Two gaps remain against a running board even with the stream: `dashboard.smoothing`
glides between packets on the device while the canvas steps, and
`session.lap.current_time` is extrapolated on the device and only sampled here.

Missing, and much cheaper than the bridge was: a value the author sets by hand on
any source, held until it is cleared and overridden by the stream when one
arrives. It needs no port, no SimHub and no board, so it is what makes a rule, a
ramp and an `unavailable_text` checkable offline. A value the author types is not
an invented signal — it is theirs, they know it is, and it is the only way to see
a rule fire with nothing plugged in. Unset stays the default, so the canvas still
shows the unavailable state unless the author asked for something else.

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

Transparency is accepted and owed the work: colours stay opaque `#RRGGBB` today,
and the obstacle was always the encoding rather than the feature — packing
`#RRGGBBAA` would make `#FFFFFFFF` indistinguishable from the
`kTransparentColor` sentinel every optional colour uses for "unset". The
sentinel moves out of the value and becomes a presence flag of its own, taking
the schema break now rather than hiding it in a value nobody authors.

The bounded caps — per widget type, per source list, per modifier list, per
string — are embedded-system limits rather than unfinished work. Their values
live in [configuration-schema.md](configuration-schema.md), which is generated
from the contract, and are deliberately not repeated here. Neither the 128 KB
payload nor internal RAM is what bounds them any more: widget state lives in
external RAM ([ADR 0026](adr/0026-ui-memory-in-external-ram.md)), so raising a
particular cap is a decision about frame time, answered by applying the document
and reading `render_us` back over `@PR:DIAG`.

## Recommended order

The remaining items are tracked in [roadmap.md](roadmap.md). The order worth
doing them in: the live-value preview first, because a rule, a ramp, a graph
trace and a real string length cannot be judged against a placeholder; then the
bounded value nodes, which more remaining items wait on than any other; then the
bundle, because a dashboard nobody can install is not a dashboard anyone shares;
then transparency and repeated structures; then images that survive a move
together with reflow in the transfer; and last the table and track map, which
need firmware work and, for both, the plugin frame of Phase 7.

This document covers the editor. The wider comparison — what SimHub is besides
Dash Studio, and what it feeds a dashboard with — is not a parity list, because
the answer is not to copy it: the source becomes a first-party plugin, opponents
arrive as a bounded relative rather than a table, and haptics, motion and
ShakeIt stay on the PC. Those are roadmap Phase 7 and Phase 8.
