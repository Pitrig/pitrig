# Dashboard widgets

The semantics of the `dashboard` document: screens, containers and slots, the
widget types and their sources, captions, conditional styling and colour ramps.
The property table, defaults and bounds are the generated
[configuration-schema.md](configuration-schema.md); the documents themselves,
their presence rules and authoring are in
[device-configuration.md](device-configuration.md).

## Screens and widgets

A dashboard owns a bounded `screens` array of up to four screens, and the driver
swipes between them on a board with a touch panel — one swipe moves one screen,
however far the finger travels, because the swipe that moved the screen owns the
rest of that press. Each screen carries its own `id`, `background_color`, and an
ordered `widgets` array discriminated by a `type` property. Every widget also
carries a stable `id`. A screen's `id` is what a `goto_screen` action names, so
it is worth setting to something the dashboard means rather than leaving as the
generated default.

`dashboard.transition` says how a move between screens is drawn, and applies to
every move whether a swipe or a tap asked for it. `slide` is the default and is
the horizontal animation a swipe reads as; `none` replaces the screen in a
single frame. The animation draws the screen being left as well as the one
arriving, for every one of its frames, so it costs more than either screen does
at rest — a screen filled with widgets is where that is felt, and `none` is the
answer for a dashboard that would rather arrive than travel. It is one setting
for the dashboard rather than one per screen, because a per-screen answer would
only hold in one direction.

A **shape** widget may hold widgets of its own, which makes it a container. The
geometry of the widgets inside it is relative to its box, and they nest up to
four levels deep. A container performs no layout — it is a parent and a
rectangle: its own border and padding do not move what it holds, so a child at
the origin sits on the container's top-left corner rather than inside its
frame. It is a widget first, so it draws its own frame, stacks among its
siblings and can take a tap like any other; the shape you would once have put
behind a group is the container now.

**A container clips its children unless it says otherwise.** What a container
holds is drawn inside it, and a widget that reaches past its edge is cut off
there. `clip_children: false` draws the overhang instead, which is what a caption
straddling a child's top border needs. A container's own border and caption are
never cut by its own clip: the device draws both on the *parent*, so they belong
to the box above.

Geometry itself is not bounded by the container either way. The only box refused
is one that falls entirely off the display; a widget the clip hides is still in
the document, still selectable in the editor, and drawn again the moment the
property is turned off.

| Container property | Shape | Meaning |
| --- | --- | --- |
| `widgets` | array ≤32 | Widgets parented to this shape, placed relative to its box. |
| `clip_children` | bool | Cuts those widgets off at this box. Omitted means it does; `false` draws them where they land. |

A **slot** widget is an area of a screen that switches what it shows. It holds up
to eight `pages`, one of which is visible; the widgets on a page are placed
relative to the slot's box, exactly as a container's children are. A slot draws
nothing at all — a background, border, radius, caption or styling rule on one is
rejected rather than ignored, so a plate behind the area is an ordinary shape
under it. A slot is authored directly on a screen and never inside a container,
which is what keeps composition to one build pass per widget type.

Tapping the slot cycles the pages that are `in_loop`. A page with a `trigger` is
raised over the loop while its event lasts, and then the slot returns to the loop
page that was showing. While an event is up the tap does nothing. When several
pages are triggered at once the earlier one in the array wins, so page order is
priority. See [ADR 0021](adr/0021-widget-groups-and-slots.md).

| Slot property | Shape | Meaning |
| --- | --- | --- |
| `pages` | array ≤8 | Pages this slot switches between, in priority order. At least one must be in the loop. |
| `clip_children` | bool | Cuts the widgets on every page off at the slot's box. Not an appearance — a slot still draws nothing — so it is accepted where a background or a border is refused. |

| Page property | Shape | Meaning |
| --- | --- | --- |
| `widgets` | array ≤32 | Widgets on this page, placed relative to the slot's box. A page costs no nesting level, so they sit one below the slot — exactly where a container shape's children would. |
| `in_loop` | bool | Included in the sequence a tap cycles. Omitted means it is; `false` leaves it reachable only by its trigger. |
| `trigger` | `none`, `value_changed`, `conditions` | How telemetry raises this page. `none` needs no source, rules or duration, and carrying any is rejected. |
| `source` | object | Telemetry binding the trigger watches. Required by both triggers. |
| `conditions` | array ≤4 | `op`, `value`. First match raises the page. For `trigger: conditions` only. |
| `duration_ms` | 0..10000 | How long the page stays up after its event fires. Required by `value_changed`; with `conditions`, 0 holds the page only while a rule matches. |

`value_changed` raises the page whenever the watched value differs from the last
one seen, which is what makes a momentary aid such as ABS or traction control
readable without naming a threshold. The comparison is exact, so it suits
booleans and discrete levels rather than a float that drifts. The first reading
is what a change is measured against rather than a change in itself, so a slot
does not flash its alerts at startup.

These rules are deliberately separate from the styling `conditions` every widget
has: which page a slot shows and how a widget is painted are different questions
about different fields.

Every widget may carry one `action`, and a tap on it navigates. Thirty-two tap
targets across the dashboard is the bound.

| Action property | Shape | Meaning |
| --- | --- | --- |
| `type` | `none`, `next_screen`, `previous_screen`, `goto_screen` | What the tap does. Omitted leaves the object refusing input. |
| `screen` | string | Target screen `id`, for `goto_screen` only. The other types name no screen, and one that does is rejected rather than ignored. |

An empty transparent shape with an action is an invisible rectangle that takes a
tap — that is how a corner of the screen becomes a back button without a widget
to press. A slot already spends its tap on cycling its pages, so carrying both is
rejected; a widget with an action on one of its pages consumes the tap and the
slot does not cycle. See [ADR 0020](adr/0020-screen-navigation.md).

Widgets live in a dashboard-wide pool, one per type, and a screen names them by
reference — so a cap is a budget across every screen rather than a per-screen
allowance. The production firmware supports these widget types:

| Type | Draws |
| --- | --- |
| `text` | up to three telemetry sources composed into one string |
| `shape` | a rectangle or ellipse; no telemetry of its own |
| `bar` | one telemetry source as a filled track, optionally from a configured origin |
| `arc` | one telemetry source swept around an arc, as a ring or a needle |
| `indicator` | up to 16 lamps, in a strip or around a ring, lighting as one source climbs its range |
| `graph` | up to three rolling traces over one plot, sampled on its own timer |
| `image` | an uploaded image, optionally tinted |
| `slot` | nothing of its own; an area that switches between its pages |

Each pool's cap is in [configuration-schema.md](configuration-schema.md) and is
not repeated here. Together they hold more widgets than either the payload or a
single screen can take: `kMaximumWidgetsPerScreen` is 255, the most a uint8 can
reference, so four screens share the pools rather than one screen exhausting
them.

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
- `clock_ms` accepts the same and renders `HH:MM:SS`, which is what a session,
  stint or fuel clock reads as — the same field as a lap, told over hours
  instead of thousandths;
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

Without `transform`, source text is preserved; a numeric value that arrived
with no text of its own — nothing the SimHub line protocol produces — is shown
as an integer, or as a float to three decimals with trailing zeros dropped.
Optional `prefix` and `suffix` strings belong to the transform rather than to
one of its types, so they apply to an untransformed value too; each is limited to 15 UTF-8 bytes, and a value
long enough to crowd them out keeps its own text. Incompatible binding,
modifier, and transform types are rejected before the dashboard is created.

## Widgets that map one source

`text` composes its sources into a string; the other telemetry-driven widgets
consume one source and map it through an input window instead. That window is
`minimum` and `maximum` on the widget itself, in the binding's own units, and
the resulting fraction is clamped, so a value outside the window reads as full
or empty rather than overflowing. The source is read as a number the same way a
condition source is: booleans as 0 and 1, and a text-formatted field parsed the
way the `number` transform parses one. The properties, defaults and ranges of
every widget type are in the generated
[configuration-schema.md](configuration-schema.md); what follows are the rules
the table cannot state.

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

- `bar` fills from `origin` — the value inside the window the fill grows out
  of, which is what makes a centred delta bar. The frame background is the
  track, so a bar needs no track colour of its own.
- `arc` sweeps `sweep_deg` from `start_angle_deg`. `mark` changes the drawing,
  not the mapping: `ring` fills the sweep up to the value, `needle` points a
  line from the centre at it, as thick as the ring and reaching the same
  radius, so a needle needs no geometry of its own.
- Both ring shapes — the `arc` widget and an `indicator` in `arc` shape — take
  the circle they draw on from `radius_px` and `center_x_px` / `center_y_px`.
  A zero radius keeps the rule the box always had: half the shorter inner side
  less half the thickness. A radius of its own may be larger than the box and
  the centre may sit outside it; the widget still clips to its box, so what
  reaches the screen is the band of that circle crossing the box — how a
  shallow rev band across the top of a round display is authored without a box
  the size of the circle. A ring on the box must fit twice across the shorter
  side; a ring with its own radius only has to be no thicker than twice it.
- `indicator` lights up to 16 `segments`, each with its own `threshold` on the
  mapped fraction; `blink_threshold` defaults to `2`, outside the clamped
  fraction, so a strip never blinks unless asked. An `arc` shape spends
  `segment_gap_px` along its own ring and rounds lamp ends rather than corners;
  whole degrees are all an arc resolves, so lamps and gaps are snapped to one
  size each and the group is centred on `sweep_deg` rather than filling it —
  no lamp is wider than its neighbour. `inverted` lights from the far end
  without changing which lamp lights when, so a mirrored pair of rev bars is
  one authored strip placed twice.
- `graph` samples on a clock of its own, not when the screen repaints and not
  when telemetry arrives: sampling on the repaint silently halved a 16 ms
  interval on a dashboard drawing at 32 fps, and sampling on arrival handed the
  plot the feed's jitter. Each sample keeps a sixteenth of a pixel vertically,
  so a slow trace slopes instead of stepping. `traces` adds up to two more
  sources over the same plot, sharing the point count and the clock with
  windows of their own. Two allowances are kept clear inside the plot: half the
  line width, so a value at either end of its window is drawn whole, and,
  when `border.radius_px` rounds the frame, enough for the plot's corners to
  clear the curve. A styling rule that
  names a `color` repaints every trace at once. The history is presentation
  state; nothing else can read it.
- `shape` and `image` bind no telemetry of their own, except that an image
  whose asset is a **sprite sheet** draws one frame: `sprite_frame` picks it
  outright, or `sprite_frame_source` picks it from telemetry, rounded and
  clamped to the frames the sheet holds. It is the only widget property whose
  valid range comes from an uploaded asset rather than from the contract, and
  a frame past the sheet is a composition error. An `alpha8` asset carries
  coverage and no colour, so there `recolor` *is* the colour: omitted it draws
  white, and `recolor_opa` does not apply.

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

The Images page shows both halves as pictures rather than as names. An installed
image is drawn from the configurator's own copy of what it sent — the board
never sends one back — so what is on screen is the converted bitmap, banding and
all, rather than the source file; a staged one is drawn from the file that was
picked, because what it will become depends on the size and format still being
chosen. Both sit on a checkerboard, so transparency reads as transparency rather
than as black. Beside them are two bars over the same seven megabytes: what the
installed package occupies, and what the staged selection would occupy once
packed — not their sum, because installing replaces the package whole.

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
see [Fonts](device-configuration.md#fonts).

A caption may also read telemetry rather than repeat what was authored, which is
what lets a panel name the track, the session or the compound it is showing:

```json
"title": { "text": "TRACK", "source": { "binding": "track.name" } }
```

`text` is then the fallback: the caption reads it until the field arrives, and
again whenever the field goes away or reports an empty string, so a source
without one is rejected. The widget's
box is measured against the fallback either way — a live string longer than it
is drawn past the box rather than resizing the widget, which keeps a caption
from moving the layout every time the value changes. The value is rendered as
the field reports it, so this is a text field's property above all; a numeric
one reads as its plain number.

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
and an image its recolor tint. A shape and an indicator draw no content of their
own, so they take `background_color` and `border_color` and ignore `color`.

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

`fill_corners` decides how those fills meet a rounded corner. `rounded`, the
default, gives the background and a bar's value fill the box radius less
whatever they sit inside, which is what a filled widget has always drawn — and
what makes a half-filled bar round off its leading edge in the middle of the
track. `square` leaves them square and clips the widget to its own outline
instead, so the fill runs straight where it stops and still follows the rounding
where it meets the ends of the box. Only the corners are clipped, and only while
the radius is non-zero, so a square box pays nothing for the property.

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
