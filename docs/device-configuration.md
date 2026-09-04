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
| `esp32s3_devkit` | none — the board has no display |

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

## Dashboard widgets

Screens, containers and slots, the widget types and their sources, captions,
conditional styling and colour ramps are in
[dashboard-widgets.md](dashboard-widgets.md).

## Authoring in the configurator

The window is a rail of six workspaces — **Dashboard**, **Modules**,
**Protocol**, **Configs**, **Firmware**, **Info** — reachable with `Cmd`/`Ctrl`
and a digit, over one page at a time. Dashboard has pages of its own (Canvas,
Templates, Fonts, Images); `Save to board` sits above them and applies to the
document rather than to the page. Each destructive device action lives beside
what it affects: erasing the font package on Fonts, the images on Images,
resetting the configuration and restarting the board on Configs.

The **Transport** section is last on the Protocol page and folded closed. It is
the only setting that decides whether the configurator can reach the board at
all — a speed a USB-serial bridge cannot hold leaves a board that answers
nothing — so its controls arrive disabled behind a warning, and a tick unlocks
them for one visit. The pin pair is the exception: firmware checks it against
the board's own and refuses a document that names another, so a wrong number
costs a refused save rather than a dark board.

The template library holds dashboards — a whole document, whose `Add` appends
its screens to the open dashboard and whose `Use` replaces it — and widgets,
one widget with its subtree and `Add` alone; both scale to the board in hand on
the way in, and `Save to templates` takes the selected widget or, with none,
the whole dashboard. Placing a widget is a mode: the fragment follows the
pointer until a click lands it, scaled only when it would not otherwise fit.
Choosing a different board while a draft is open is a layout transfer,
confirmed in the numbers the new display produces, with the same
`Fit`/`Stretch` preference the Configs page uses
([ADR 0023](adr/0023-dashboard-templates-and-layout-transfer.md)).

Supported bindings are listed in the generated
[telemetry catalog](telemetry-catalog.md); the binding input shows the field's
category, type, unit, recommended update rate and wire ID.

The canvas, the inspector and the advanced JSON editor all edit the same
draft. Dragging and resizing write absolute logical `x`, `y`, `width` and
`height` and keep the widget within the display bounds; selecting empty canvas
exposes the screen's `background_color`. Every widget may define `z_index`
from `-32768` through `32767`: larger values render above smaller, missing
values default to zero, and equal values use stable configuration order so the
preview and the device agree. A drawn widget carries only its box; a new image
widget starts on the first installed image, because without one it has nothing
to draw.

The preview draws no telemetry values. The configurator never receives any —
the control protocol carries no command for reading them and SimHub owns the
port while a session runs — so every source reads unavailable and the canvas
shows what the board shows in that state. Nothing about this touches the
document.

A click picks the outermost container a widget is in; double-click opens a
container, `Cmd`/`Ctrl`-click reaches the deepest widget, and `Escape` steps
back out. Dropping a widget puts it in the innermost container that holds its
whole box, and on the screen when none does; holding `Cmd`/`Ctrl` keeps the
current parent, and a multi-widget drag never reparents. A new widget lands in
the container being worked in, and `Duplicate` and paste keep the copy beside
its original. Dragging a screen tab reorders the screens — the order the device
swipes through, so it is a document edit — and a `goto_screen` action names a
screen by `id`, so reordering never breaks one.

The layer list can lock or hide a layer for the editing session; locking and
hiding are the editor's own state and never reach the document, which the
device would reject for the unknown properties. Editing is undoable, so nothing
destructive asks for confirmation. Keyboard editing works on the selected
widget wherever focus is, except inside a text field: arrows nudge by one
logical pixel (ten with `Shift`, resizing with `Cmd`/`Ctrl` and `Alt`),
`Delete` removes, and `Cmd`/`Ctrl` with `Z`, `Shift+Z`, `C`, `V`, `D`, `G`,
`Shift+G`, `S`, `]` and `[` undo, redo, copy, paste, duplicate, wrap in a
container, unwrap, save to a file, bring to front and send to back (`Alt` with
a bracket moves one step). `Cmd`/`Ctrl`+`S` saves to a file and never to the
board, because saving to the board delivers fonts and restarts it. A copied
widget travels as JSON through the system clipboard, and a pasted fragment is
validated against the same schema allow-list the device payload uses.

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

## Control protocol

The `@SC:` commands, the `INFO` and `DIAG` replies, their error tokens and the
NVS record rules are in [control-protocol.md](control-protocol.md).

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
| `dashboard` | `board`, `dashboard.transition`, `dashboard.smoothing`, `dashboard.screens` | 131072 bytes |
| `modules` | `board`, `hardware` | 32768 bytes |
| `protocol` | `board`, `telemetry_transport` | 1024 bytes |

The shape of every root property is in the generated
[configuration-schema.md](configuration-schema.md).

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

Property names are snake case, placement is `x`, `y`, `width` and `height`,
and the complete property table is generated into
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
        { "type": "text", "id": "gear", "font": "bold_6x8", "color": "#FFFFFF",
          "source": { "binding": "transmission.gear" },
          "condition_source": { "binding": "engine.rpm_percent" },
          "color_rules": [
            { "op": "at_or_above", "value": 97, "color": "#D50000", "blink_ms": 150 },
            { "op": "at_or_above", "value": 90, "color": "#FFD600" }
          ] }
      ]
    }
  ]
}
```

The rules behind this are [ADR 0030](adr/0030-addressable-led-peripherals.md);
what the document must satisfy:

- A strip and a matrix are **separate devices, not segments of one chain**,
  each on a data pin the board declares free, and two devices may not name the
  same pin. A board drives four, because both chips have four RMT transmit
  channels — the DevKitC-1 drives three, its status lamp holding one. Lamp
  numbering is per device and starts at zero.
- An `rgb_strip` is a pin and a `count`; its optional `segments` describe the
  mounting as straight runs in wire order, whose counts must sum to the strip's
  own, and a matrix carrying any is rejected. An `rgb_matrix` is a pin and a
  `width` by `height` grid — eight by eight by default, sixteen at most — with
  its wiring `order`, `origin` corner and quarter-turn `rotation_deg`. The
  device's `brightness` is the one brightness; a layer has none.
- Every layer whose gate holds paints, and a shared lamp goes to the layer that
  **lit most recently**; layers that came up in the same frame keep authored
  order. That is the opposite of a widget's styling rules, because a device
  composes a picture out of several things being true at once.
- `color_rules` are the exception and are first-match: each compares
  `condition_source` — the one value a layer watches, shared with its
  `conditions` gate — and sets any of `color`, `background_color`, `blink_ms`
  and `hold_ms`; a rule that sets none is rejected, as is a `condition_source`
  nothing reads or a gate or rule without one. `color` repaints what the layer
  draws, black pixels of a sprite excepted; `background_color` fills the lamps
  the layer covers first; a rule's `blink_ms` takes over from the layer's while
  it holds and `hold_ms` keeps it applied after it stops matching.
- A type the firmware does not know is rejected rather than ignored. Matrix
  artwork travels inside the document as palette-indexed pixels — no partition,
  no upload, no restart — and a strip carrying sprites is rejected; a digit past
  the end of the palette leaves the layers below visible. Breaking changes to
  public properties require a later schema version; compatible bounded
  extensions must be recorded in an ADR.

The schema retains deterministic limits. They are generated from
`configuration/configuration_schema.json` together with the firmware structures
and the configurator types, and the current values are listed in
[configuration-schema.md](configuration-schema.md). The widest payload bound is
131072 bytes of compact JSON — the dashboard's, which at the ~350 bytes a widget
measures carries around 370 of them; it is what sizes the shared line, record and
reply buffers, while the `modules` document is held to 32 KB — enough for a
matrix's artwork to travel inline — and `protocol` to a kilobyte. That is
the tighter of the two bounds a dense dashboard meets: the per-type widget pools
add up to more widgets than one payload can carry, and a single screen addresses
at most 255 of them whatever the pools hold. Those buffers live in external memory, and so does the parser's document:
the parser points cJSON's allocator at PSRAM, because the SPIRAM policy sends
every allocation under 16 KiB to internal RAM and a document is thousands of
small nodes.

The property table, object shapes, enumerations, and rejection reasons in that
generated reference are authoritative; this document describes the rules around
them.
