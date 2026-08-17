# Device configuration

This document defines the schema 9 configuration contract implemented by the
firmware and read by the desktop configurator. Earlier schemas are
intentionally not part of the current contract.

## Hardware identity and user configuration

Every firmware build selects one immutable hardware board identity with
`CONFIG_SIMCORE_FACTORY_BOARD_*`. The board registry resolves that identity to
the firmware drivers for hardware physically built into that board. Firmware
reports the stable board identifier; the configurator maps it to its local
supported board profile.

User configuration cannot change the physical board. Every configuration must
contain the same board identifier, and a mismatch is rejected before saving.

Configurator board profiles:

| Board identifier | Logical display |
| --- | --- |
| `t_display_s3` | 320 × 170 |
| `guition_esp32_4848s040` | 480 × 480 |
| `guition_jc1060p470c` | 1024 × 600 |

Hardware is composed from two sources:

1. **Board-provided hardware** is physically built into the selected board and
   declared by its immutable board-registry mapping.
2. **User-configured hardware** is an optional bounded list of supported
   devices and driver settings in the sparse device configuration.

The user-configured hardware list may be empty. It is not limited to displays:
supported entries may represent buttons, encoders, LEDs, touch controllers, or
other peripherals. Only hardware types and drivers implemented by the current
firmware may appear in the list.

For the current configurator contract, a display provided by the board is
enabled by default. Its driver, transport, pin assignments, logical dimensions,
and other board-owned settings are read-only. The configurator displays this
information but does not allow the user to disable, replace, or edit the
built-in display. The optional hardware list therefore does not duplicate that
display. Logical dimensions are held by the configurator board profile rather
than transmitted by firmware or stored in device configuration.

SimCore loads user configuration in this order:

1. Active valid NVS slot.
2. Backup valid NVS slot.
3. Board-only factory configuration compiled into firmware.

The factory configuration enables no additional hardware devices, modules, or
widgets. A clean flash or reset still initializes a board-provided display, but
the screen has no dashboard content.

A saved replacement takes effect after restart. `APPLY` is the exception: it
validates a document and rebuilds the running dashboard from it without writing
storage, so an editor can preview a change live. The stored configuration is
unchanged, and a restart returns to it.

## Sparse authoring format

JSON is the human-readable format for configurator projects and presets. It is
sparse: omitted sections and properties are not expanded through a board
profile.

The configurator can create, load, save, and edit this JSON without a connected
device. The root `board` selects the local immutable board profile used for
display dimensions and preview. A local draft remains available after a
disconnect and is not replaced when another device connects. **Reload board**
is the explicit operation that discards the local draft in favor of the
connected device configuration. **Save to board** requires the draft and
connected device to have the same board identifier.

The smallest valid configuration is:

```json
{
  "board": "t_display_s3"
}
```

This configuration produces an empty dashboard on the board-provided display
and creates no additional user-configured hardware devices.

Presence rules:

- `board` is always required.
- The optional user-configured hardware list may be absent or empty.
- A missing user-configured hardware device, module, or widget is disabled and
  is not created.
- Missing user-configured hardware does not disable capabilities declared as
  built into the board.
- A missing property inside a present component uses that component's bounded
  firmware default.
- A missing telemetry transport uses the immutable board default.
- The default telemetry UART baud rate is `921600` and matches the checked-in
  complete SimHub profile and the configurator profile generator's fallback.
- Unknown properties are rejected.
- Loading a preset inserts only the properties explicitly present in that
  preset.

Board presets are examples, not inheritance profiles. Applying one preset must
not silently add unrelated modules, widgets, or transport settings.

Colors use `"#RRGGBB"`.

## Modules and widgets

A dashboard owns a bounded `screens` array of up to four screens, and the driver
swipes between them on a board with a touch panel. Each screen carries its own
`id`, `background_color`, and an ordered `widgets` array discriminated by a
`type` property. Every widget also carries a stable `id`. A screen's `id` is
what a `goto_screen` action names, so it is worth setting to something the
dashboard means rather than leaving as the generated default.

A **shape** widget may hold widgets of its own, which makes it a container. The
geometry of the widgets inside it is relative to its box, and they nest up to
four levels deep. A container performs no layout — it is a parent and a
rectangle. It is a widget first, so it draws its own frame, stacks among its
siblings and can take a tap like any other; the shape you would once have put
behind a group is the container now.

**A container does not clip its children.** A caption overhanging its widget's
border is drawn, and so is a widget nudged past the container's edge. The only
geometry refused is a box that falls entirely off the display.

A container may name a `slot` (1..4). Shapes sharing a slot must agree on their
parent and their box, exactly one of them must carry `slot_default`, and only one
is visible at a time. Tapping the slot on the board cycles to the next one; a
shape whose `slot_conditions` match over its `slot_source` is shown instead while
they match, with `hold_ms` keeping a momentary trigger readable. Those rules are
deliberately separate from the styling `conditions` every widget has: which shape
a slot shows and how that shape is painted are different questions about
different fields. See [ADR 0021](adr/0021-widget-groups-and-slots.md).

| Container property | Shape | Meaning |
| --- | --- | --- |
| `widgets` | array ≤16 | Widgets parented to this shape, placed relative to its box. |
| `slot` | 0..4 | Slot this shape switches in. Omitted leaves it always visible. |
| `slot_default` | bool | Shown before anything selects another shape in the slot. |
| `slot_source` | object | Telemetry binding the activation rules watch. |
| `slot_conditions` | array ≤4 | `op`, `value`, `hold_ms`. First match shows this shape. |

Every widget may carry one `action`, and a tap on it navigates. Sixteen tap
targets across the dashboard is the bound.

| Action property | Shape | Meaning |
| --- | --- | --- |
| `type` | `none`, `next_screen`, `previous_screen`, `goto_screen` | What the tap does. Omitted leaves the object refusing input. |
| `screen` | string | Target screen `id`, for `goto_screen` only. The other types name no screen, and one that does is rejected rather than ignored. |

An empty transparent shape with an action is an invisible rectangle that takes a
tap — that is how a corner of the screen becomes a back button without a widget
to press. A shape in a slot already spends its tap on cycling, so carrying both
is rejected; a widget with an action inside such a container consumes the tap and
the slot does not cycle, and a nested slot takes the tap before the one around
it. See [ADR 0020](adr/0020-screen-navigation.md).

Widgets live in a dashboard-wide pool, one per type, and a screen names them by
reference — so a cap is a budget across every screen rather than a per-screen
allowance. The production firmware supports these widget types:

| Type | Cap | Draws |
| --- | --- | --- |
| `text` | 32 | up to three telemetry sources composed into one string |
| `shape` | 24 | a rectangle or ellipse; no telemetry of its own |
| `bar` | 16 | one telemetry source as a filled track, optionally from a configured origin |
| `arc` | 8 | one telemetry source swept around an arc |
| `indicator` | 4 | up to 16 lamps lighting as one source climbs its range |
| `graph` | 2 | a rolling trace of one source, sampled on its own timer |
| `image` | 8 | an uploaded image, optionally tinted |

`kMaximumWidgetsPerScreen` is the sum of those caps, so a single screen can
reference the whole pool; what bounds a document overall is the payload size.

Module lifecycle is derived from configured consumers. A `lap_timer` modifier
activates the Lap Timer module automatically; there is no separate root Lap
Timer object or dedicated Lap Timer widget.

A screen is the layout coordinate space for the widgets it owns. Every widget
placement uses absolute logical pixels:

```json
{
  "x": 16,
  "y": 16,
  "width": 72,
  "height": 72
}
```

The schema has no regions, region identifiers, anchors, or anchor offsets.

Example sparse configuration:

```json
{
  "board": "guition_esp32_4848s040",
  "dashboard": {
    "screens": [
      {
        "id": "main",
        "widgets": [
          {
            "type": "text",
            "id": "tc",
            "sources": [
              {
                "binding": "vehicle.aids.traction_control_level"
              }
            ],
            "placement": {
              "x": 16,
              "y": 16,
              "width": 72,
              "height": 72
            },
            "border": {
              "color": "#00E5FF",
              "width_px": 3,
              "radius_px": 8
            },
            "title": {
              "text": "TC"
            }
          }
        ]
      }
    ]
  }
}
```

Only the properties shown above are present in the project and public payload.
The text widget supplies its documented defaults for omitted padding, fonts,
colors, alignment, background, caption placement, and unavailable text.

Until a value arrives, a widget renders its placeholder. An explicit
`unavailable_text` is that placeholder; omitting it renders a zero through each
source's own transform, so a plain value reads `0` and a time value keeps its
format with every field zeroed, such as `00:00.000`.

A text widget renders its `sources` in order and joins them into one string, up
to three of them. Each source is a telemetry field with its own modifiers and
its own transform, and the transform affixes are what separate one source from
the next, so no format string is involved:

```json
{
  "type": "text",
  "sources": [
    { "binding": "session.position", "transform": { "prefix": "P " } },
    { "binding": "session.participants", "transform": { "prefix": "/" } }
  ]
}
```

That widget reads `P 3/24`. One widget rather than three matters because a value
label is sized to its own text: neighbouring widgets would move the `/` every
time the position changed width.

A source with no value contributes the zero its own transform renders, so a live
source keeps updating beside a silent one, and `unavailable_text` appears only
while no source has a value at all.

The `binding` property of a source always identifies the canonical telemetry
field. An ordered modifier pipeline may change the typed value before its
presentation transform:

```json
{
  "binding": "session.lap.current_time",
  "modifiers": [
    {
      "type": "lap_timer"
    }
  ],
  "transform": {
    "type": "time",
    "format": "duration_ms",
    "prefix": "LAP ",
    "suffix": ""
  }
}
```

The `lap_timer` modifier accepts only the unsigned
`session.lap.current_time` binding. It preserves the numeric millisecond type
while applying smooth local progression, correction, lap restart detection,
and a fixed one-second stale-telemetry timeout. Its presence activates the
module automatically. The current implementation allows at most one Lap Timer
modifier across the dashboard.

Text widgets support the optional `time` transform:

- `duration_ms` accepts unsigned milliseconds and renders `MM:SS.mmm`;
- `signed_duration_ms` accepts signed milliseconds and renders `+S.mmm` or
  `-S.mmm`.

The `number` transform renders `value * scale + offset` with `decimals` digits
after the point:

```json
{
  "binding": "engine.water_temperature",
  "transform": {
    "type": "number",
    "decimals": 0,
    "scale": 1.8,
    "offset": 32,
    "suffix": "°F"
  }
}
```

`decimals` defaults to `0` and is limited to 4, `scale` defaults to `1` and
`offset` to `0`, so `{"type": "number", "decimals": 2}` only adds precision.
Unit conversion is expressed through `scale` and `offset` because the device
holds no unit names; the configurator offers presets for the common conversions
and writes nothing else. The transform accepts every numeric binding and also a
text binding whose source parses as a plain number, which is how the
source-formatted fields such as `vehicle.speed` and `engine.rpm` are converted.
A source that does not parse renders the placeholder, exactly like an
unavailable value.

Without `transform`, source text is preserved. Optional `prefix` and `suffix`
strings belong to the transform rather than to one of its types, so they apply
to an untransformed value too; each is limited to 15 UTF-8 bytes, and a value
long enough to crowd them out keeps its own text. Incompatible binding,
modifier, and transform types are rejected before the dashboard is created.

## Widgets that map one source

`text` composes its sources into a string; the other telemetry-driven widgets
consume one source and map it through an input window instead. That window is
`minimum` and `maximum` on the widget itself, in the binding's own units —
`ValueRange` is flattened, so those are plain widget properties — and the
resulting fraction is clamped, so a value outside the window reads as full or
empty rather than overflowing. The source is read as a number the same way a
condition source is: booleans as 0 and 1, and a text-formatted field parsed the
way the `number` transform parses one.

```json
{
  "type": "bar",
  "id": "rpm_bar",
  "source": { "binding": "engine.rpm" },
  "minimum": 0,
  "maximum": 8000,
  "orientation": "horizontal",
  "fill_color": "#00C853"
}
```

- `bar` fills the frame from `origin` — the value inside the window the fill
  grows out of, which is what makes a centred delta bar — along `orientation`,
  optionally `inverted`. The frame background is the track, so a bar needs no
  track colour of its own, and `fill_grad_color` gives the fill a linear
  gradient.
- `arc` sweeps `sweep_deg` degrees from `start_angle_deg` at `thickness_px`,
  over an optional `track_color`.
- `indicator` lights up to 16 `segments`, each with its own `color` and its own
  `threshold` on the mapped fraction, spaced by `segment_gap_px` and rounded by
  `segment_radius_px`; unlit lamps use `off_color`, and the strip flashes at
  `blink_ms` once the fraction reaches `blink_threshold`, whose default of `2`
  is outside the clamped fraction and therefore never blinks.
- `graph` keeps `point_count` samples taken every `sample_interval_ms` and draws
  them as a `line_width_px` trace in `line_color`. The history is presentation
  state the widget samples for itself; nothing else can read it.
- `shape` and `image` bind no telemetry of their own. A shape is a `rectangle`
  or an `ellipse` — a line is a thin rectangle — and an image names an uploaded
  asset through `image`, optionally tinted with `recolor` at `recolor_opa`.

Defaults and ranges for all of these are in
[configuration-schema.md](configuration-schema.md).

## Uploaded images

An `image` widget draws an uploaded asset by identifier. The device holds no
decoder: the configurator converts the source PNG, JPEG or BMP into the pixel
layout the display draws and into the size the widget uses, so resizing the
widget re-converts the artwork rather than scaling it on the board. Images are
neither scaled nor rotated at runtime, which is also what keeps the ESP32-P4 on
its accelerated draw path.

Image identifiers follow the font-family rule: 1 to 31 lowercase ASCII letters,
digits, `_`, or `-`. Resolution is exact — a configuration naming an image the
device does not hold is rejected before it replaces the running dashboard,
exactly like a missing font family. The package format and its upload protocol
are defined in [Image asset storage](image-assets.md); installing a package
requires a reboot before its images can be drawn.

## Widget captions

A `title` labels a widget's frame. Only `text` is required to place one; the
caption then sits half above the top of the widget's box, horizontally centred
on it, and the frame line behind it is cut so the label reads as a break in the
border rather than as text laid over it:

```json
"title": { "text": "WATER", "alignment": "top_left", "offset_x_px": 12 }
```

`alignment` picks which point of the widget's **outer** box the caption is
anchored to, on both axes, and `offset_x_px` and `offset_y_px` move it from
there. An anchor plus two offsets reaches any point, so a caption may sit on any
border, in a corner, or inside the widget; nothing constrains it to the box.

The anchor is one of nine names arranged as a grid, and the unprefixed row is
the vertically centred one:

| | left | centre | right |
| --- | --- | --- | --- |
| **top** | `top_left` | `top_center` | `top_right` |
| **middle** | `left` | `center` | `right` |
| **bottom** | `bottom_left` | `bottom_center` | `bottom_right` |

A caption defaults to `top_center`, which is where captions have always sat. The
top and bottom rows straddle their border line — half the caption above it, half
below — which is what lets the caption break it. The middle row sits inside the
box like any other content and crosses no border.

The cut follows wherever it lands. `border_gap` turns it off, and
`gap_padding_px` is the clear space kept around the caption inside it, 4 pixels
on each side by default. The cut is a thin band along one border line, clipped
to the widget's box, over whatever paints behind the caption — the widget's own
background when it has one that reaches the frame, otherwise the screen or the
container
behind it. Three consequences are worth knowing when authoring: a caption
crossing no border cuts nothing, a caption on a corner cuts the horizontal
border and not the vertical one, and because the band is straight, a caption
pushed into a rounded corner takes a bite out of the curve — offset it by about
`radius_px` plus the border width to clear it.

Where the caption is placed is authored, but the room a widget reserves for it
is not: a widget sized by its contents always reserves the default placement,
so moving a caption or turning its cut off never resizes the widget.

A caption needs a font as soon as it has text, and family resolution is exact —
see [Fonts](#fonts).

The same nine anchor names position a text widget's `value` label, there against
the widget's **content area** — the box less its border and padding — rather
than its outer box, and without straddling anything. That property defaults to
`center`, and the three unprefixed names are what it accepted before the other
six existed, so a value authored as `left`, `center` or `right` still sits
vertically centred.

## Conditional styling

Every widget with a frame — which is every widget type — may watch one telemetry
field and restyle itself from it. The watched field is independent of what the
widget displays, which is what makes a shift indicator possible:

```json
{
  "type": "text",
  "sources": [{ "binding": "transmission.gear" }],
  "condition_source": { "binding": "engine.rpm_percent" },
  "conditions": [
    {
      "op": "at_or_above",
      "value": 0.97,
      "color": "#FFFFFF",
      "background_color": "#D50000",
      "blink_ms": 150
    },
    { "op": "at_or_above", "value": 0.9, "color": "#FF4040" }
  ]
}
```

The first rule whose comparison holds describes the widget, and whatever it
leaves unset stays as authored — rules do not accumulate, so order is the
priority. `op` is `above`, `at_or_above`, `below`, `at_or_below`, `equal`, or
`not_equal`, compared against `value`. A rule may set `color`,
`background_color`, `border_color`, `hidden`, and `blink_ms`; up to four rules
per widget.

`color` is the widget's content colour, and what content means is the type's own
business: text paints its label, a bar and an arc their fill, a graph its line,
a shape its border, and an image its recolor tint.

A colour left out of a rule keeps the widget's static colour, which also means a
rule cannot clear a background it did not paint. A widget that needs to switch
its background on and off should be authored without one and let a rule paint
it.

`blink_ms` is a full period between 100 and 5000 milliseconds, or 0 for steady.
The whole widget flashes — background, frame, caption and value together — so a
warning reads as one pulsing box rather than as parts changing at different
moments. The phase starts when the rule begins, so a widget is always visible on
the frame that first applies it.

A rule applies while it matches, so a widget flashes for exactly as long as
traction control is engaged. `hold_ms` keeps it applied for that long after it
stops matching, up to 10000, which is what makes a trigger shorter than a blink
period visible at all:

```json
{ "op": "equal", "value": 1, "color": "#FFD400", "blink_ms": 200, "hold_ms": 1500 }
```

Re-triggering restarts the hold, so a rule that keeps matching never lapses.

The watched value is read as a number from any source type, with booleans as 0
and 1 and a text-formatted source parsed the way the `number` transform parses
one. A boolean field therefore takes `equal` or `not_equal` against `1` or `0`,
which is what the configurator offers once the watched field is a boolean.
While that value is unavailable, or while it does not hold a number, no rule
matches and the widget renders exactly as authored.

`background_inset_px` on the widget puts a gap between the border and whatever
paints the background, so a widget that turns red keeps its frame visible
instead of flooding to the edge. It applies to the authored background and to
one a rule paints, and the inset area shows whatever is behind the widget.

## Colour ramps and gradients

A `color_ramp` interpolates a colour from the same watched source rather than
switching it at a threshold. Its `target` selects what the colour paints —
`content`, `background`, or `border` — and up to four `stops` anchor it:

```json
{
  "condition_source": { "binding": "tyre.front_left.temperature" },
  "color_ramp": {
    "target": "background",
    "stops": [
      { "at": 60, "color": "#0091EA" },
      { "at": 85, "color": "#00C853" },
      { "at": 105, "color": "#D50000" }
    ]
  }
}
```

Below the first stop and above the last one the ramp holds that stop's colour,
so a value outside the authored band reads as its nearest edge. The ramp is the
base layer: a matching rule paints over it, and with fewer than two stops or an
unavailable value the authored colour stands.

Gradients are static rather than value-driven. `background_grad_color` with
`background_grad_dir` gives the frame background a linear gradient along the
`horizontal` or `vertical` axis, and `fill_grad_color` does the same for a bar
fill. A gradient needs a background to run over, so it is drawn only where a
background colour is authored, and a rule or a ramp that repaints the background
replaces the near colour while the authored gradient stays.

## Authoring in the configurator

Supported bindings are listed in the generated
[telemetry catalog](telemetry-catalog.md). The configurator exposes these fields
through a searchable binding input and shows the selected field's category,
type, unit, recommended update rate, and wire ID.

The configurator provides direct manipulation for configured dashboard
widgets. Selecting a widget on the display preview exposes its schema-backed
properties in the inspector. Dragging and resizing write absolute logical
`x`, `y`, `width`, and `height` values and keep the widget within the immutable
display bounds. Selecting empty canvas space exposes the screen-level opaque
`background_color`. The advanced JSON editor remains available and edits the
same draft used by the canvas, validation, the font and image dependency checks,
and the save flow.

Every widget may define `z_index` from `-32768` through `32767`. Larger values
render above smaller values. Missing values default to zero; equal values use
stable configuration order so the configurator preview and firmware display
remain identical.

The preview toolbar exposes one button per widget type plus `Duplicate`, undo,
redo and `Delete`. Adding a widget creates it with only a centered placement
(clamped for smaller displays), leaving its content and style fields unset for
explicit configuration in the inspector; a new image widget is the one exception
and starts on the first installed image, because an image widget without one has
nothing to draw.

The preview can draw a synthetic lap in place of telemetry, which is what makes
conditional styling and colour ramps visible while authoring: the values are
generated in the configurator, coherently — the gear follows the speed, the
engine speed follows the gear — and the lap can be paused and scrubbed to stop
on a state worth judging. A third mode renders every source as unavailable, so
`unavailable_text` and a hiding rule can be checked too. None of the three
modes touches the document; the configurator never receives telemetry, because
the control protocol carries none and SimHub owns the port while a session runs.

Widgets are selected one at a time, by shift-clicking to add to the selection,
or by dragging a rubber band across the canvas. A selection of two or more can
be aligned to the selection's own bounds and, from three, spread so the gaps between
them match. Dragging is snapped to the other widgets' edges and centres and to
the display's, and optionally to a grid; the canvas magnifies up to eight times
and pans with the middle button. A layer list shows the stack top first, restacks
by dragging, renames a widget by editing its `id`, and can lock or hide a layer
for the editing session — locking and hiding are the editor's own state and
never reach the document, which the device would reject for the unknown
properties.

Editing is undoable, so nothing destructive asks for confirmation. A drag or a
held arrow key is one entry rather than one per commit, and a raw-JSON editing
session is one entry rather than one per keystroke; loading a file, reloading
from the board, saving and resetting each start a new history. Keyboard editing
works on the selected widget wherever focus is, except inside a text field:
arrow keys nudge by one logical pixel and by ten with `Shift`, `Delete` removes,
and `Cmd`/`Ctrl` with `Z`, `Shift+Z`, `C`, `V` and `D` undo, redo, copy, paste
and duplicate. A copied widget travels as JSON through the system clipboard, so
it can be pasted into another project; a pasted fragment is validated against
the same schema allow-list the device payload uses.

## Fonts

Production firmware exposes no compiled dashboard font families. Every widget
font reference uses a stable family identifier plus `size_px` and resolves to
an uploaded TTF or OTF face that the device rasterizes at the requested size.
Widget fonts must be explicit; a text widget without a title does not require a
title font. Family resolution is exact: an unavailable family causes dashboard
composition to report an error instead of silently selecting another font. A
pixel size never fails to resolve, because it is rasterized from the installed
face.

Font family identifiers contain 1 to 31 lowercase ASCII letters, digits, `_`,
or `-`. `size_px` is an integer from 1 through 255. One configuration may
reference at most 8 families. Font files are not part of this JSON document or
configuration NVS.

Uploaded faces are stored as one checksummed package in a dedicated partition.
The package format and firmware validation rules are defined in
[Font asset storage](font-assets.md), including its separate bounded serial
upload protocol. Installing a new package requires a reboot before its families
can be selected; changing only a `size_px` of an installed family requires
neither an upload nor a restart. Before applying a configuration, the
configurator compares its required families with the device catalog. When a
family is missing it collects one TTF/OTF source per family, replaces the
complete package, and then saves the configuration. Images are checked the same
way against the installed image package, and firmware repeats both checks before
it lets a configuration replace the running dashboard.

## Device information

`INFO` reports immutable device metadata and configuration storage status:

```text
@SC:INFO
@SC:OK:INFO:board=t_display_s3,firmware=<version>,schema=5,source=factory,generation=0,storage=1
```

Fields:

- `board` is the immutable factory board identifier;
- `firmware` comes from the ESP-IDF application description;
- `schema` is the supported public configuration schema;
- `source` is the configuration source active in the current runtime and is
  `factory`, `slot_a`, or `slot_b`;
- `generation` is the stored-record generation active in the current runtime;
- `storage` is `1` when persistent configuration storage is available.

The configurator must resolve display information from the `board` field and
its local supported-board registry, present it as read-only device information,
and must not infer physical hardware from a saved user configuration. An
unknown board is incompatible until the configurator adds an explicit board
profile. Boards without a built-in display require a separately documented
profile before they are supported.

`SET` and `RESET` update persistent state but do not change `INFO` or `GET`
until reboot. This keeps both operations consistent with the configuration
currently used by modules and widgets.

## Control commands

The configuration protocol remains line-oriented and shares the selected
telemetry serial transport. Asset upload temporarily switches that same
transport into a binary stop-and-wait mode: `@SC:FONT:` for font packages
(see [Font asset storage](font-assets.md)) and `@SC:IMAGE:` for image packages
(see [Image asset storage](image-assets.md)). The two share one binary session,
so an upload that starts while another is running is answered `busy` rather than
interleaved. Neither is a configuration command, and their bytes are never
stored in configuration NVS.

| Request | Successful response | Purpose |
| --- | --- | --- |
| `@SC:INFO` | `@SC:OK:INFO:...` | Read device and storage metadata. |
| `@SC:GET` | `@SC:OK:CONFIG:<JSON>` | Read the exact sparse JSON payload. |
| `@SC:VALIDATE:<JSON>` | `@SC:OK:VALID` | Validate without saving. |
| `@SC:APPLY:<JSON>` | `@SC:OK:APPLIED` | Validate and apply to the running dashboard without saving. |
| `@SC:SET:<JSON>` | `@SC:OK:SAVED:reboot_required=1` | Validate and save. |
| `@SC:RESET` | `@SC:OK:RESET:reboot_required=1` | Remove saved configuration. |
| `@SC:REBOOT` | `@SC:OK:REBOOTING` | Restart the device. |

Errors use `@SC:ERR:<reason>:screen=<n>,widget=<n>,path=<property>`. The reason
token keeps its position, so a host that only reads the reason is unaffected.
`screen` and `widget` are `-1` when the failure is not inside a widget, and
`path` names the property that caused it. The reason tokens are listed in
[configuration-schema.md](configuration-schema.md).

After reset and reboot, `GET` returns the board-only factory configuration and
the board-provided display remains enabled with an empty dashboard.

## Public payload

The public payload is the bounded sparse JSON document described above. The
configurator sends it directly; there is no binary codec or hexadecimal wrapper.
The serial protocol is line-oriented, so payloads must be compact single-line
JSON without literal CR or LF bytes. Whitespace inside that one line is valid,
but the configurator should use `JSON.stringify` output.

Top-level properties:

| Property | Shape | Meaning |
| --- | --- | --- |
| `board` | string, required | Immutable compatible board identifier. |
| `hardware` | array, optional | User-configured peripherals; currently only `[]` is supported. |
| `telemetry_transport` | object, optional | Transport `id` and optional `uart` settings. |
| `dashboard.screens` | array, optional | Bounded screen list, at most four entries. |

Nested property names use snake case. Placement uses `x`, `y`, `width`, and
`height`; widget stacking uses `z_index`; font uses `family` and `size_px`; a
mapped source uses `minimum` and `maximum`. UART settings use `port`, `tx_pin`,
`rx_pin`, `baud_rate`, and `silence_esp_logs`. Style properties follow the names
used in the sparse examples, including `background_color`,
`background_grad_color`, `background_grad_dir`, `background_inset_px`,
`fill_color`, `fill_grad_color`, `width_px`, `radius_px`, `offset_x_px`,
`offset_y_px`, `border_gap`, and `gap_padding_px`. The
complete property table is generated into
[configuration-schema.md](configuration-schema.md).

The current board mappings expose GPIO 43 for UART TX and GPIO 44 for UART RX;
other pairs are rejected to prevent collisions with display, flash, PSRAM,
strapping, or USB pins. Native USB CDC is supported by `t_display_s3` and
`guition_jc1060p470c`. The `guition_esp32_4848s040` display mapping occupies a
native USB pin and therefore uses its board-default UART transport. Explicit
UART configuration is not exposed for `guition_jc1060p470c` until a safe board
connector pin mapping is part of the public hardware contract.

Firmware parses every received or persisted document and rejects malformed
JSON, unknown or duplicate properties, unsupported component shapes, board
mismatches, values outside bounded ranges, invalid or incompatible bindings,
modifiers, and transforms, and invalid widget geometry. Validation in the
configurator improves feedback but does not replace this firmware boundary
check.

The configurable `hardware` array currently accepts only an empty array because
no user-configurable peripheral driver has a complete production contract yet.
Non-empty entries are rejected rather than guessed. Breaking changes to public
properties require a later documented schema version; compatible bounded
extensions must be recorded in an ADR.

The schema retains deterministic limits. They are generated from
`configuration/configuration_schema.json` together with the firmware structures
and the configurator types, and the current values are listed in
[configuration-schema.md](configuration-schema.md). The payload bound is 65536
bytes of compact JSON, which a screen filled to every per-type widget cap does
not come close to. The buffers it sizes live in external memory, and so does the
parser's document: the parser points cJSON's allocator at PSRAM, because the
SPIRAM policy sends every allocation under 16 KiB to internal RAM and a document
is thousands of small nodes.

The property table, object shapes, enumerations, and rejection reasons in that
generated reference are authoritative; this document describes the rules around
them.

## Internal persistence

Firmware wraps the exact validated JSON bytes in a private NVS record containing
magic, record version, schema version, payload size, generation, and CRC32.
Two records are stored in the dedicated `simcore_cfg` partition. Firmware
writes and verifies the inactive slot before selecting it.

Configurator code must not reproduce or depend on this NVS record format.

Schema 0 and schema 1 records are unsupported and are not migrated. They fall
back to another valid slot or the board-only factory configuration.

## Legacy tooling

The schema 0 Python configuration CLI and its inheritance profiles were removed
after the desktop configurator implemented the complete `INFO`, `GET`,
`VALIDATE`, `SET`, `RESET`, and `REBOOT` round trip. Current tooling authors and
transfers only the sparse JSON document described here.
