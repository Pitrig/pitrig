# Device configuration

This document defines the configuration contract implemented by the firmware
and read by the desktop configurator. Its version, property table and bounds
live in `configuration/configuration_schema.json` and its generated reference,
[configuration-schema.md](configuration-schema.md). Earlier schemas are
intentionally not part of the current contract.

## Hardware identity and user configuration

Every firmware build selects one immutable hardware board identity with
`CONFIG_SIMCORE_FACTORY_BOARD_*`. The board registry resolves that identity to
the firmware drivers for hardware physically built into that board. Firmware
reports the stable board identifier; the configurator maps it to its local
supported board profile.

User configuration cannot change the physical board. Every configuration
document must contain the same board identifier — all three of them do, which is
what makes each answerable on its own — and a mismatch is rejected before
saving.

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

User configuration is not one document. It is three — `dashboard`, `modules`
and `protocol` — each transferred, stored, validated and applied on its own. See
[Public payload](#public-payload) for what each carries and
[ADR 0024](adr/0024-separate-configuration-documents.md) for why.

SimCore loads them in this order:

1. The three board-only factory documents compiled into firmware.
2. Whatever is stored, one document at a time on top of them.

A document with no stored record therefore runs its factory value while the
others run what was saved. The factory documents enable no additional hardware
devices, modules, or widgets. A clean flash or reset still initializes a
board-provided display, but the screen has no dashboard content.

A saved replacement takes effect after restart. `APPLY` is the exception: it
validates one document and rebuilds the running composition from it without
writing storage, so an editor can preview a change live. The stored
configuration is unchanged, and a restart returns to it. The protocol document
is the one this cannot help: the link is selected once at startup, so applying
it stages the setting and rebuilds nothing.

## Sparse authoring format

JSON is the human-readable format for configurator projects and presets. It is
sparse: omitted sections and properties are not expanded through a board
profile.

The configurator can create, load, save, and edit this JSON without a connected
device. The root `board` selects the local immutable board profile used for
display dimensions and preview. A local draft remains available after a
disconnect and is not replaced when another device connects. **Load config from
board** is the explicit operation that discards the local draft in favor of the
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
- The Guition ESP32-4848S040 is the exception, and it is expressed in documents
  rather than in the default: its telemetry runs over the board's CH340 bridge,
  which does not hold `921600`, so the configurator writes
  `telemetry_transport.uart.baud_rate` of `460800` into every document it
  creates, converts or applies a template onto for that board, and the board's
  factory payload names the same rate. A sparse document is never expanded
  through a board profile, so the property has to be present to have an effect.
- Unknown properties are rejected.
- Loading a preset inserts only the properties explicitly present in that
  preset.

Board presets are examples, not inheritance profiles. Applying one preset must
not silently add unrelated modules, widgets, or transport settings.

Colors use `"#RRGGBB"`.

## Modules and widgets

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
| `widgets` | array ≤16 | Widgets parented to this shape, placed relative to its box. |
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
| `widgets` | array ≤16 | Widgets on this page, placed relative to the slot's box. A page costs no nesting level, so they sit one below the slot — exactly where a container shape's children would. |
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

Every widget may carry one `action`, and a tap on it navigates. Sixteen tap
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
  over an optional `track_color`. `mark` says what the value draws at the angle
  it maps to: `ring` fills the sweep up to it, and `needle` points a line from
  the centre at it instead, as thick as the ring would have been and reaching
  the same radius, which leaves the track reading as the scale behind it. The
  mark changes the drawing rather than the mapping, so a needle needs no
  geometry of its own.
- Both ring shapes — the `arc` widget and an `indicator` in `arc` shape — take
  the circle they draw on from `radius_px` and `center_x_px` / `center_y_px`.
  A zero radius keeps the rule the box always had, half the shorter inner side
  less half the thickness, so an authored dashboard draws where it drew before.
  A radius of its own is free to be larger than the box, and the centre is free
  to sit outside it: the widget still clips to its box, so what reaches the
  screen is the band of that circle crossing the box. That is how a shallow rev
  band across the top of a round display is authored — a large radius with the
  centre pushed down — without a box the size of the circle stealing the middle
  of the screen from everything else. The thickness rule follows the radius: a
  ring on the box still has to fit twice across the shorter side, while a ring
  with a radius of its own only has to be no thicker than twice that radius.
- `indicator` lights up to 16 `segments`, each with its own `color` and its own
  `threshold` on the mapped fraction, spaced by `segment_gap_px` and rounded by
  `segment_radius_px`; unlit lamps use `off_color`, and the strip flashes at
  `blink_ms` once the fraction reaches `blink_threshold`, whose default of `2`
  is outside the clamped fraction and therefore never blinks. `shape` decides
  how the lamps are laid out: a `strip` runs them along its `orientation`, and
  an `arc` spaces them around `sweep_deg` degrees from `start_angle_deg` at
  `thickness_px` — the rev ring a round dashboard is built on. An arc spends
  `segment_gap_px` along its own ring, so a gap is the same width wherever the
  lamp sits, and any non-zero `segment_radius_px` rounds the lamp ends rather
  than its corners. Whole degrees are all an arc resolves, so the lamps and the
  gaps are snapped to one size each and the group is centred on `sweep_deg`
  rather than filling it exactly — a ring may run a degree or two short or long
  of what was authored, but no lamp is wider than its neighbour. Each shape
  ignores the other's geometry, so switching one costs no rewrite. `inverted`
  lights from the far end — right instead of left, top instead of bottom, the
  end of the sweep instead of its start — without changing which lamp lights
  when, so a mirrored pair of rev bars either side of a gear is one authored
  strip placed twice.
- `graph` keeps `point_count` samples taken every `sample_interval_ms` and draws
  them as a `line_width_px` trace in `line_color`. Samples are taken when
  a clock of its own says so, not when the screen repaints and not when
  telemetry arrives: sampling on the repaint silently halved a 16 ms interval
  on a dashboard drawing at 32 fps, and sampling on arrival handed the plot
  the feed's jitter, which stretches the curve because a sample always
  advances the same distance along the time axis. Each sample also keeps a
  sixteenth of a pixel of vertical precision, so a slow-moving trace slopes
  instead of stepping between whole rows. `traces` adds up to two more
  sources over the same plot, each with a `source`, a `minimum`/`maximum` window
  and a `line_color` of its own — the widget's own source is the first trace, so
  three is the total. One point count and one sample clock serve all of them, so
  the traces line up along the same time axis; the windows are separate, which
  is what lets a speed trace and a throttle trace share a field without either
  flattening against an edge. Two allowances are kept clear inside the plot on
  every side: half the line width, because the stroke is centred on the path, so
  a value at either end of its window is drawn whole instead of being cut by the
  frame the container clips against; and, when `border.radius_px` rounds the
  frame, enough for the plot's corners to clear the curve — the content area is
  a rectangle, so its corners would otherwise sit outside the arc the frame line
  follows. A styling rule that
  names a `color` repaints every trace at once — the widget is in alarm, not one
  of its lines — and each takes its own colour back when the rule stops
  matching. The history is presentation state the widget samples for itself;
  nothing else can read it.
- `shape` and `image` bind no telemetry of their own. A shape is a `rectangle`
  or an `ellipse` — a line is a thin rectangle — and an image names an uploaded
  asset through `image`, optionally tinted with `recolor` at `recolor_opa`. An
  `alpha8` asset carries coverage and no colour, so there `recolor` *is* the
  colour rather than a tint over one: omitted it draws white, and `recolor_opa`
  does not apply to it. An image whose asset is a **sprite sheet** draws one of
  its frames: `sprite_frame` picks one outright, or `sprite_frame_source` picks
  it from telemetry — rounded to a whole number and clamped to the frames the
  sheet holds. This is the one thing an image binds telemetry for, and the only
  widget property whose valid range comes from an uploaded asset rather than
  from the contract: a frame past what the sheet holds is a composition error,
  exactly as naming an image that is not installed is.

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

The Images page shows both halves as pictures rather than as names. An installed
image is drawn from the configurator's own copy of what it sent — the board
never sends one back — so what is on screen is the converted bitmap, banding and
all, rather than the source file; a staged one is drawn from the file that was
picked, because what it will become depends on the size and format still being
chosen. Both sit on a checkerboard, so transparency reads as transparency rather
than as black. Beside them are two bars over the same four megabytes: what the
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
see [Fonts](#fonts).

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

## Authoring in the configurator

The window is a rail of workspaces on the left and one page beside it:
**Dashboard**, **Modules**, **Protocol**, **Configs**, **Firmware**, **Info**
and **Debug**, reachable with `Cmd`/`Ctrl` and a digit — ordered from what an
author works in to what only reports back. The rail collapses to
icons, and marks a draft that differs from the board and a firmware image the
board has installed but not started.

Dashboard is the workspace with pages of its own — **Canvas**, **Templates**,
**Fonts**, **Images** — because all four answer the same question, what this
dashboard is made of. `Save to board` sits above them and applies to the
document rather than to whichever page is open, and the canvas keyboard
commands are live only while the canvas is.

The **Transport** section is last on the Protocol page, and folded closed. It
is the only setting in the application that decides whether the configurator can
reach the board at all — a speed a USB-serial bridge cannot hold leaves a board
that answers nothing — so its controls arrive disabled behind a warning that
says what can go wrong and how to get back, and a tick unlocks them for that
visit only. Two acts to reach it, in other words, and neither of them
accidental. The pin pair is the exception it names: firmware checks it against
the board's own and refuses a document that names another, so a wrong number
there costs a refused save rather than a dark board.

Each destructive device action lives beside what it affects: erasing the
board's font package on the Fonts page, erasing its images on Images, resetting
the configuration on Configs, restarting the board on Configs and Firmware.
Info states what the board and the application are and changes nothing.

The template library holds two kinds of thing, on the same card. A **dashboard**
is a whole document — every screen and everything on them — and it offers two
things: `Add` takes screens out of it, one or all of them, and appends them to
the dashboard already open without touching it; `Use` replaces that dashboard
entirely, and says so before it does. Both scale to the board in hand on the way
in. A **widget** is one widget lifted out of a dashboard for reuse inside
another, and offers `Add` alone; a container brings its whole subtree, which is
how a rev-counter with its shift lights becomes one entry. Neither is saved
from the library page: saving is an act on what is on the canvas, so
`Save to templates` sits beside `Save to board` and takes the selected widget
when there is one and the whole dashboard when there is not.

Both kinds of card are the same card: a preview taking half of it, a name, a
line of counts, and what can be done with it. Only a dashboard names the board
it was drawn for, because only a dashboard is bound to one — a widget is placed
onto whatever is open and scaled if it has to be. They draw what they hold
with the renderers the canvas uses, so an entry looks in the library as it will
look once it is on a board. A dashboard with more than one screen is a gallery —
dragged sideways, stepped with the arrows, counted by the dots — and its document
is read the first time a card needs it rather than shipped with the listing. The
save dialog shows the same preview, because what it is about to make is one of
those cards.

Placing a widget entry is a mode rather than a drop. `Add` hands the fragment to
the canvas, which follows the pointer with the widget drawn as itself until a
click puts it down — centred on the pointer, selected on landing. `Escape` or a
press outside the display gives up. The saved box is kept: a gauge saved at
180 × 180 is worth that here too, and it is scaled only when it would not
otherwise fit, by the smallest factor that makes it, through the engine a board
transfer uses. The canvas menu offers the same entries, and one more: a screen
taken out of a saved dashboard, added at the end rather than replacing the one
being worked on.

The canvas names the board it is drawing, at the right of the status bar under
it, in place of the resolution that row used to print — the board is that
resolution, so the two were the same fact written twice. A connected board
fills it in and the control is read-only; with nothing plugged in it is a
select, and the canvas is sized by it before any document exists — so an empty
canvas states which display it is an empty canvas *of*, and offers the three
ways to fill it: a new dashboard, a file, or the template library. Choosing a different board
while a draft is open is a layout transfer rather than a relabelling, so it
confirms in the numbers the new display produces; the `Fit`/`Stretch` toggle
beside the select is the same preference the Configs page and the template
library use, and it is kept across restarts.

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

A drawn widget carries only its box, leaving its content and style fields unset
for explicit configuration in the inspector; a new image widget is the one
exception and starts on the first installed image, because an image widget
without one has nothing to draw.

The preview draws no telemetry values. The configurator never receives any —
the control protocol carries no command for reading them and SimHub owns the
port while a session runs — so every source reads unavailable and the canvas
shows what the board shows in that state: each source's own placeholder, or the
widget's `unavailable_text` where it has one. Nothing about this touches the
document.

Widgets are selected one at a time, by shift-clicking to add to the selection,
or by dragging a rubber band across the canvas. A selection of two or more can
be aligned to the selection's own bounds and, from three, spread so the gaps between
them match. Dragging is snapped to the other widgets' edges and centres and to
the display's, and optionally to a grid; the canvas magnifies up to eight times
with `Cmd`/`Ctrl` and the wheel, keeping whatever is under the pointer under it,
and pans with the middle button.

A click picks the **outermost container** a widget is in, so a full container is
dragged by any point on it rather than only by its edges. Going deeper is asked
for: double-click opens a container and makes the level inside it clickable,
`Cmd`/`Ctrl`-click reaches the deepest widget in one go, and `Escape` steps back
up one level at a time — the container holding the selection, then out of the
opened container itself. A breadcrumb above the canvas says where the editor is
looking and leaves at any level. Opening a **slot** also dims the rest of the
screen, because a page is one alternative for one box; opening a shape does not,
because a shape is an ordinary parent.

Dropping a widget on the canvas puts it in the innermost container that holds
its whole box, and on the screen when none does — so a widget joins a panel by
being dragged onto it and leaves by being dragged off. The candidate is outlined
while the drag runs. Holding `Cmd`/`Ctrl` through the drag keeps the current
parent, which is how a readout is parked over a plate without joining it. A
multi-widget drag never reparents: moving only the widget under the pointer
would split the selection between two boxes.

A new widget lands in the container being worked in — the opened one, or the
selected one — and on the active screen otherwise. `Duplicate` and paste keep
the copy in the same container as its original.

Screens are authored one at a time through a tab strip, and dragging a tab
reorders the screens — which is the order the driver swipes through, so it is a
document edit and undoable like any other. A `goto_screen` action names a screen
by `id`, so reordering never breaks one.

A layer list shows the stack top first, folds each container, restacks by
dragging a row or with `Cmd`/`Ctrl` and the bracket keys (`Alt` for one step),
renames a widget by editing its `id`, and can lock or hide a layer for the
editing session — locking and hiding are the editor's own state and never reach
the document, which the device would reject for the unknown properties. A slot
lists every page, so a widget can be dropped onto a page the canvas is not
showing. Dragging a row that is part of the selection drags the whole selection.
Picking a widget on the canvas unfolds its containers in the list and scrolls to
it.

Editing is undoable, so nothing destructive asks for confirmation. A drag or a
held arrow key is one entry rather than one per commit, and a raw-JSON editing
session is one entry rather than one per keystroke; loading a file, reloading
from the board, saving and resetting each start a new history. Keyboard editing
works on the selected widget wherever focus is, except inside a text field:
arrow keys nudge by one logical pixel and by ten with `Shift`, the same arrows
with `Cmd`/`Ctrl` and `Alt` resize instead — right and down grow, left and up
shrink — `Delete` removes, and `Cmd`/`Ctrl` with `Z`, `Shift+Z`, `C`, `V`, `D`,
`G`, `Shift+G`, `S`, `]` and `[` undo, redo, copy, paste, duplicate, wrap in a
container, unwrap, save to a file, bring to front and send to back. `Alt` with a
bracket moves one step instead. `Cmd`/`Ctrl`+`S` saves the document to a file
and never to the board: saving to the board delivers fonts and restarts it,
which is not what a keystroke should set off.

A copied widget travels as JSON through the system clipboard, so
it can be pasted into another project; a pasted fragment is validated against
the same schema allow-list the device payload uses.

### Keeping the draft and the board together

Three things can differ, so the configurator tracks three: what the board has
stored, what it is showing, and the draft in the editor. A save moves the first,
a live `@SC:APPLY` moves the second, and both of them equalling the draft is what
being in sync means. The per-document chip says which one is behind — not on the
board while the screen is stale, shown but not saved while the board draws a
draft it would lose on a restart.

Where they part company the configurator asks rather than picks. Connecting to a
board whose stored documents differ from the draft, or watching them change under
an open editor, raises one question with three answers: take the board's
configuration, show the draft on the board without writing it, or save the draft.
Live apply stays off until that is answered, so a board is never quietly
overwritten by a draft its author had forgotten about, and what else holds live
apply back is named where it happens — safe mode, a draft targeting another
board, a font the board does not hold, a draft that does not validate.

The board is asked `@SC:INFO` every five seconds while it is connected and no
operation is running, which is what notices a document written from elsewhere or
a package installed behind the editor's back; the configuration is re-read only
when a generation actually moved. A restart the board takes on its own stays
invisible to it, because the reply carries what is stored rather than what is
composed.

### Saving to the board

`Save to board` is one sequence in the main process: work out which documents
differ from what the board is holding, resolve the families the dashboard names
against the font library, build the package, send it only when the board does
not already hold those exact bytes, and `@SC:SET` each differing document —
protocol first, dashboard last, so a partial failure leaves the cheap writes
done and the expensive one untouched. A document that matches the board is not
written at all, which is why changing a baud rate no longer costs sixty
kilobytes of dashboard.

How it ends depends on what it did. A face the board did not have becomes
usable only after a restart, so installing one ends in `@SC:REBOOT` and a
reconnect — as does saving onto a board that already owes a restart for a font
or image package it has accepted, and as does writing the protocol document.
That last one is the whole reason the document is separate: the link is selected
once at startup, so a transport written without a restart would be a setting
that is stored and not in force, and the firmware says so by answering
`reboot_required=1` for that document alone. A changed speed also means the
board comes back at the new one, which is the case the reconnect can fail on.
Otherwise the save ends in `@SC:APPLY` for each document it wrote, which
rebuilds the running composition from what was just written to NVS. That is why
an ordinary save costs no dark screen.

The Configs page lists the three documents with what each is doing on the board
— in sync, modified, factory, or a stored record the firmware refused — and can
load, save or erase any one of them on its own. Below that it states the
difference between the draft and the configuration the board holds, per document
and property by property, before any of this happens.
Widgets and screens are matched by `id`, so moving one reads as a move rather
than as a deletion and an unrelated arrival.

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

A font may name a `fallback` family, tried for the glyphs the first one does not
have:

```json
"font": { "family": "roboto_black", "size_px": 40, "fallback": "material-icons" }
```

That is what puts an icon and a number in one widget — the icon family carries no
digits and the text family carries no icons, so a value of `⛽ 46.2 L` needs both.
The fallback resolves exactly like the family it backs, and the device builds it
at the same `size_px`, so it costs one more font of memory and counts as one of
the eight families a configuration may name. The configurator ships **Material
Icons** in its font library and offers a picker of the racing-relevant glyphs
beside every caption and affix field, so an icon is typed as itself rather than
as a codepoint.

Uploaded faces are stored as one checksummed package in a dedicated partition.
The package format and firmware validation rules are defined in
[Font asset storage](font-assets.md), including its separate bounded serial
upload protocol. Installing a new package requires a reboot before its families
can be selected; changing only a `size_px` of an installed family requires
neither an upload nor a restart.

A family identifier is not free text: it is the id of an entry in the
configurator's font library, which is what lets a document name a face without
carrying one. Saving to a board resolves every family the document names against
that library, builds a package holding exactly those, and installs it only when
the device does not already report the same `crc` and `entries` — then saves the
configuration and restarts. A family the library cannot resolve stops the save
before anything is written and asks for a file. Images are checked against the
installed image package but are still uploaded by hand, and firmware repeats both
checks before it lets a configuration replace the running dashboard.

## Device information

`INFO` reports immutable device metadata and configuration storage status:

```text
@SC:INFO
@SC:OK:INFO:board=t_display_s3,firmware=<version>,schema=14,storage=1,safe_mode=0,boot_failures=0,reset_reason=power_on,last_phase=none,dashboard=valid:3,modules=absent:0,protocol=valid:1
```

Fields:

- `board` is the immutable factory board identifier;
- `firmware` comes from the ESP-IDF application description;
- `schema` is the supported public configuration schema;
- `storage` is `1` when persistent configuration storage is available;
- `safe_mode` is `1` when the board came up on the recovery surface: the link,
  this control protocol and firmware upload, and nothing else — no display, no
  dashboard, no modules, no font or image upload, and no telemetry decode. See
  [ADR 0025](adr/0025-startup-order-and-safe-mode.md);
- `boot_failures` counts the crashes and watchdog resets since the last power-on
  or the last document written or erased. Three of them in a row is what sets
  `safe_mode`, and a successful `SET` or `RESET` is what clears it;
- `reset_reason` is why this boot happened: `power_on`, `software`, `panic`,
  `task_watchdog`, `brownout` or `other`;
- `last_phase` is how far the **previous** boot got: `none`, `configuration`,
  `link`, `display`, `assets`, `composition` or `complete`. On a board that
  keeps crashing this is the field that says what is crashing it;
- one field per configuration document, named after it and spelled
  `<outcome>:<generation>`. The outcome is `absent`, `malformed_record`,
  `unsupported_schema`, `corrupt_payload`, `rejected` or `valid`; the generation
  is the stored record's, or `0` when there is none. `absent` is not a fault —
  it is a board running that document's factory value.

The configurator must resolve display information from the `board` field and
its local supported-board registry, present it as read-only device information,
and must not infer physical hardware from a saved user configuration. An
unknown board is incompatible until the configurator adds an explicit board
profile. Boards without a built-in display require a separately documented
profile before they are supported.

`INFO` and `GET` describe the configuration the device loaded at boot. `SET`
and `RESET` update persistent state but do not change either until reboot,
which keeps them consistent with the configuration currently used by modules
and widgets. `APPLY` does not change them either: it replaces what the
composition renders, not what was loaded, so `GET` keeps returning each
document's boot payload and the per-document outcomes keep naming the boot
records.

## Runtime diagnostics

`DIAG` reports what the running device costs rather than what it holds: live
memory figures and the frame sampler's last second, on a window that slides
twenty times a second — a caller polling faster than that second is answered
with figures that moved since its previous call, not with one frozen block per
second. It is the same measurement the debug overlay draws, answered on the link
instead of on the panel, so a board whose limits are being measured can be read
exactly and from a script rather than off its own screen.

It is a **debug-build** command. Firmware built without `CONFIG_SIMCORE_DEBUG`
carries no sampler, so it answers `@SC:ERR:unsupported`; see
[runtime-performance.md](runtime-performance.md) for the build.

```text
@SC:DIAG
@SC:OK:DIAG:internal_total=393216,internal_free=180224,internal_min=172032,internal_largest=131072,psram_total=8388608,psram_free=7340032,psram_min=7208960,psram_largest=4194304,fps=59.9,cpu0=12.4,cpu1=31.0,render_us=3120,flush_us=1980,sync_us=410,frame_max_us=17600,work_max_us=6200,gap_max_us=9100,inval_px=6059,inval_areas=3,drawn_areas=1,lat_us=7100,lat_max_us=12900,lat_n=58,stack_lvgl=3200,stack_transport=2100,stack_control=1800,stack_upload=2400,stack_sampler=1500,uptime_ms=48213
```

Fields:

- `internal_*` and `psram_*` are the total, current free, lowest free since
  boot, and largest free block of each heap, in bytes. `psram_total` is `0` on a
  board without external RAM. They are read when the command arrives rather than
  taken from the one-second snapshot, so a host that just applied a document
  reads what that document costs now; `*_min` is the low-water mark since boot,
  which is what a memory budget is set against;
- `fps`, `cpu0` and `cpu1` carry one decimal, and every `*_us` field is
  microseconds. They mean exactly what the same names mean in
  [runtime-performance.md](runtime-performance.md), and they come from the
  sampler's last completed interval — a composition that has just changed is
  described a second later;
- `inval_px`, `inval_areas` and `drawn_areas` describe what a frame was asked to
  redraw: the pixels every invalidation covered, how many invalidations there
  were, and how many areas survived LVGL's merging to be drawn and sent. They
  are what turn a render figure into a cost model — see
  [runtime-performance.md](runtime-performance.md);
- `lat_us` and `lat_max_us` are the average and worst end-to-end latency over
  the interval, from a telemetry value's commit into its slot to the display
  accepting the frame that drew it, and `lat_n` is how many frames carried
  one. This is the figure the display latency work is judged by: it covers the
  wake, the render and the flush together, so a change that moves none of the
  parts but reorders them still shows up here;
- `stack_*` is the free stack of each monitored task in bytes. The font and
  image upload tasks share `stack_upload`, reported as the smaller of the two,
  because only one of them can own the link at a time;
- `uptime_ms` is milliseconds since boot.

Nothing here is part of the configuration contract: the field list is a
diagnostic surface that may grow, and a host must read it by name rather than
by position.

## Control commands

The configuration protocol remains line-oriented and shares the selected
telemetry serial transport. Asset upload temporarily switches that same
transport into a binary stop-and-wait mode: `@SC:FONT:` for font packages
(see [Font asset storage](font-assets.md)) and `@SC:IMAGE:` for image packages
(see [Image asset storage](image-assets.md)). The two share one binary session,
so only one upload owns the stream at a time. On the link an upload owns there
are no more commands until it ends: every byte is a frame, so a second `BEGIN`
sent mid-upload is not a command but a bad frame, and it ends the running
upload with `invalid_frame`. A `BEGIN`, `INFO` or `CLEAR` for either kind that
arrives on another link while an upload runs is answered `busy` (see
[SimHub custom serial](simhub-custom-serial.md) for the development build that
attaches a second link). Neither is a configuration command, and their bytes
are never stored in configuration NVS.

Every command that carries configuration names one of the three documents.
`<doc>` below is `dashboard`, `modules` or `protocol`, spelled in lower case the
way the contract spells every other value on this wire. A name that is none of
them is answered `@SC:ERR:unknown_document`.

| Request | Successful response | Purpose |
| --- | --- | --- |
| `@SC:INFO` | `@SC:OK:INFO:...` | Read device and storage metadata, and each document's stored record. |
| `@SC:DIAG` | `@SC:OK:DIAG:...` | Read live memory and frame figures. Debug builds only; a product build answers `unsupported`. |
| `@SC:GET:<doc>` | `@SC:OK:CONFIG:<doc>:<JSON>` | Read the exact sparse JSON payload that document would be loaded from: the stored record, or the board's own document while none is held. `@SC:APPLY` does not move it. |
| `@SC:VALIDATE:<doc>:<JSON>` | `@SC:OK:VALID:<doc>` | Validate without saving. |
| `@SC:APPLY:<doc>:<JSON>` | `@SC:OK:APPLIED:<doc>` | Validate and apply to the running composition without saving. |
| `@SC:SET:<doc>:<JSON>` | `@SC:OK:SAVED:<doc>:reboot_required=<0\|1>` | Validate and save. |
| `@SC:RESET:<doc>` | `@SC:OK:RESET:<doc>:reboot_required=1` | Remove one saved document. |
| `@SC:RESET` | `@SC:OK:RESET:reboot_required=1` | Remove every saved document. |
| `@SC:REBOOT` | `@SC:OK:REBOOTING` | Restart the device. |

`reboot_required` on a save is a property of the document, generated from the
schema rather than decided here: `protocol` answers 1 because the link is
selected once at startup, and `dashboard` and `modules` answer 0 because
`@SC:APPLY` brings the running composition up to what was just written. Applying
the protocol document is accepted and stages it, but rebuilds nothing — the
board picks the link up on its next start.

`@SC:INFO` reports `board`, `firmware`, `schema`, `storage`, the four boot-health
fields above, and then one field per document spelled
`<doc>=<outcome>:<generation>`. The outcome is one of
`absent`, `malformed_record`, `unsupported_schema`, `corrupt_payload`,
`rejected` or `valid`; the generation is the stored record's, or `0` when there
is none. A board running one section from flash and another from its factory
value is an ordinary state, which is why there is no single source token.

Validation errors use `@SC:ERR:<reason>:screen=<n>,widget=<n>,path=<property>`.
The reason token keeps its position, so a host that only reads the reason is
unaffected. `screen` and `widget` are `-1` when the failure is not inside a
widget, and `path` names the property that caused it. The reason tokens are
listed in [configuration-schema.md](configuration-schema.md).

Three errors are about the request rather than the document and carry no
location suffix:

| Response | When |
| --- | --- |
| `@SC:ERR:unknown_command` | The line starts with `@SC:` but names no command above. A host probes for a capability this way. |
| `@SC:ERR:unsupported` | `APPLY` on a firmware that has no live-apply handler, or on a board in safe mode, which registers none: it composed nothing to apply to and holds no fonts or images to validate against. Also `DIAG` on a product build, which carries no sampler to answer it with. |
| `@SC:ERR:busy` | `SET`, `APPLY` or `RESET` arrived before startup finished composing and it did not finish within ten seconds. The link answers well before the dashboard exists, so a write waits for something to write to; reads never do. An asset or firmware `BEGIN` or `CLEAR` in that same window is answered `busy` under its own namespace rather than waiting, because startup is still reading the partitions it would erase. |
| `@SC:ERR:unknown_document` | The command named no document, or named one this firmware does not have. |
| `@SC:ERR:storage` | `SET` or `RESET` validated but the write to configuration storage failed. |

After reset and reboot, each `GET` returns that document's compiled factory
payload and the board-provided display remains enabled with an empty dashboard.

## Public payload

The public payload is a bounded sparse JSON document. The configurator sends it
directly; there is no binary codec or hexadecimal wrapper. The serial protocol is
line-oriented, so payloads must be compact single-line JSON without literal CR or
LF bytes. Whitespace inside that one line is valid, but the configurator should
use `JSON.stringify` output.

There are three of them, and each is transferred and stored on its own. Every
one carries `board`, which is what makes it answerable for arriving at the wrong
hardware, plus the sections belonging to it — and is rejected if it carries any
other:

| Document | Top-level properties | Maximum payload |
| --- | --- | --- |
| `dashboard` | `board`, `dashboard.transition`, `dashboard.screens` | 131072 bytes |
| `modules` | `board`, `hardware` | 32768 bytes |
| `protocol` | `board`, `telemetry_transport` | 1024 bytes |

| Property | Shape | Meaning |
| --- | --- | --- |
| `board` | string, required | Immutable compatible board identifier. Present in all three documents. |
| `hardware` | array, optional | User-configured peripherals, discriminated by `type`. `rgb_strip` and `rgb_matrix` are the only kinds with a driver. |
| `telemetry_transport` | object, optional | Transport `id` and optional `uart` settings. |
| `dashboard.transition` | string, optional | How a move between screens is drawn: `slide` or `none`. Defaults to `slide`. |
| `dashboard.screens` | array, optional | Bounded screen list, at most four entries. |

A document owns the sections listed against it completely: an omitted section
means the author says it holds nothing, not that the device should keep what was
there. Sections belonging to another document are left exactly as they were, so
writing the protocol document cannot disturb a dashboard.

The smallest valid document of any kind is `{ "board": "t_display_s3" }`.

In memory the three are one bounded structure, which is what lets a rule that
spans them stay one check — a UART pin the board does not have, a font budget
over every widget, the single `lap_timer` modifier. A replacement is parsed over
the sections it owns and the whole result is validated, so a protocol document
that contradicts the dashboard already in place is rejected on arrival rather
than at composition.

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

The bound on a single numeric property is stated once, in
`configuration/configuration_schema.json` beside that property's type and
default, and generated into all four readers: the firmware validator, the
configurator's validator, the number fields of the editor, and the accepted
window printed in [configuration-schema.md](configuration-schema.md). Changing
such a bound means changing the schema and regenerating — the numbers quoted
in this guide follow it rather than the other way round. Rules that are not a
range over one property — a ramp whose stops must climb, an arc whose ring has
to fit its widget, a slot page whose trigger decides what else it may carry —
stay hand-written on both sides, because none of them can be stated as two
numbers.

A strip and a matrix are authored like this — two devices, two pins:

```json
{
  "board": "guition_jc1060p470c",
  "hardware": [
    {
      "type": "rgb_strip", "id": "rev", "pin": 32, "count": 16,
      "brightness": 120, "current_limit_ma": 1500,
      "effects": [
        { "type": "steps", "id": "shift",
          "source": { "binding": "engine.rpm_percent" },
          "minimum": 0, "maximum": 100,
          "steps": [
            { "threshold": 0.00, "color": "#00C853" },
            { "threshold": 0.92, "color": "#D50000" }
          ] },
        { "type": "solid", "id": "yellow", "color": "#FFBF00",
          "gate": "conditions",
          "condition_source": { "binding": "session.flag.yellow" },
          "conditions": [ { "op": "at_or_above", "value": 1 } ],
          "hold_ms": 1500, "blink_ms": 250 }
      ]
    },
    {
      "type": "rgb_matrix", "id": "panel", "pin": 33,
      "width": 8, "height": 8,
      "order": "serpentine", "origin": "top_left", "rotation_deg": 0,
      "effects": [
        { "type": "text", "id": "gear", "font": "large", "color": "#FFFFFF",
          "source": { "binding": "transmission.gear" } }
      ]
    }
  ]
}
```

The two are **separate devices, not segments of one chain**: each owns a data pin
and, on the wire, a transmit channel of its own, so neither can disturb the
other's lamp numbering and either can be removed without renumbering anything.
A board drives four of them, because four is how many transmit channels both the
ESP32-S3 and the ESP32-P4 have. Lamp numbering is per device and starts at zero.

Layers are painted in the order they are authored and a later one overwrites the
lamps it covers, so the flag layer above sits over the shift lights whatever they
were showing while its rule holds. That is deliberately the opposite of a
widget's styling rules, where the first match wins: a widget resolves one
appearance, while a device composes a picture out of several things being true
at once.

The configurable `hardware` array carries one entry per peripheral, each named
by a `type` the firmware has a driver for. A type it does not know is rejected
rather than ignored, so a document authored against a newer firmware fails
loudly on an older board. Breaking changes to public properties require a later
documented schema version; compatible bounded extensions must be recorded in an
ADR.

An `rgb_strip` is a data pin and a `count` of lamps. An `rgb_matrix` is a data
pin and a grid of `width` by `height`, described by the `order` its rows are
wired in, the `origin` corner its first lamp sits in, and a quarter-turn
`rotation_deg` so a panel mounted on its side still reads upright. The pin is
checked against the pins the board declares free, and two devices may not name
the same one. Matrix artwork travels inside this document as palette-indexed
pixels rather than as an uploaded asset, so it costs no partition, no upload and
no restart; a strip carrying sprites is rejected, because it has nothing to draw
them on.

The schema retains deterministic limits. They are generated from
`configuration/configuration_schema.json` together with the firmware structures
and the configurator types, and the current values are listed in
[configuration-schema.md](configuration-schema.md). The widest payload bound is
131072 bytes of compact JSON — the dashboard's, which at the ~350 bytes a widget
measures carries around 370 of them; it is what sizes the shared line, record and
reply buffers, while the other two documents are held to a kilobyte each. That is
the tighter of the two bounds a dense dashboard meets: the per-type widget pools
add up to more widgets than one payload can carry, and a single screen addresses
at most 255 of them whatever the pools hold. Those buffers live in external memory, and so does the parser's document:
the parser points cJSON's allocator at PSRAM, because the SPIRAM policy sends
every allocation under 16 KiB to internal RAM and a document is thousands of
small nodes.

The property table, object shapes, enumerations, and rejection reasons in that
generated reference are authoritative; this document describes the rules around
them.

## Internal persistence

Firmware wraps the exact validated JSON bytes in a private NVS record containing
magic, record version, schema version, payload size, generation, and CRC32. One
record per document is stored in the dedicated `simcore_cfg` partition, keyed by
the document's name, each with a generation of its own. Firmware writes a record
and reads it back — header, checksum and parse — before believing the write.

There is no second copy of a record. NVS writes a new blob before retiring the
one it replaces, so a torn write leaves the previous record readable, and the
alternating pair this used to keep bought a second copy of that same guarantee.

Configurator code must not reproduce or depend on this NVS record format.

Records of any earlier schema are unsupported and are not migrated. That
document falls back to its compiled factory payload while the other two load
normally. A record that was read but not loaded — another schema version, a
malformed record, a failed checksum, or a document this firmware rejects — is
named in the boot log with its reason, so a device that comes up on a factory
section after a firmware update can be told apart from one that was never
configured. `@SC:INFO` reports the same thing per document.

Startup order is the three factory documents compiled into the firmware, then
whatever is stored, one document at a time on top of them.
