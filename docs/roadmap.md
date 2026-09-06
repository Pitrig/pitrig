The dashboard authoring items in Phases 4 and 5 come from the SimHub comparison
in [dashboard-editor-parity.md](dashboard-editor-parity.md). Phases 7 and 8 come
from the wider comparison recorded there: what SimHub is beyond its editor, and
what a stranger needs before a board is worth owning.

Phases 1 to 6 are the platform. Phases 7 and 8 are what standing on your own
costs, and neither is ordered before finishing the parity items already listed.

# Phase 1 — Foundation

- [*] Firmware builds
- [*] Boot sequence
- [*] Logging
- [*] Persistent sparse runtime configuration
- [*] Desktop configurator read, validate, save, reset and reboot flow
- [*] Uploaded font asset pipeline
- [*] Event Bus
- [*] Static service composition
- [*] Bounded Module Manager
- [*] FreeRTOS and LVGL scheduler ownership decision
- [*] Telemetry catalog, registry and handle-based ingestion
- [*] Performance service and debug overlay
- [*] Generated configuration contract
- [*] Screen as an explicit composition primitive
- [*] Compile-time widget type descriptors
- [*] Double-buffered runtime configuration ownership
- [ ] Protocol tokens owned by the generator — the `@PR:` prefix emitted as one
      generated constant that the router, the control service, the asset
      sessions and the configurator all read, and a check that rejects a
      character-array spelling of a protocol token. The rename that produced
      `@SC:` in the router passed every gate the repository has, because a text
      search cannot find a token spelled one letter at a time. Needs an ADR

# Phase 2 — Hardware

A board is a controller as well as a display, so the three unchecked items below
stopped being foundation work and became the gate on Phase 3.

- [ ] GPIO
- [ ] SPI
- [ ] I2C
- [*] Display interface
- [*] Input interface (pointer; buttons and encoders still owed)
- [*] LED interface and the RMT driver behind it
- [ ] A platform bus service, so a second I2C or SPI part is possible at all —
      today the only bus in the firmware is private to the GT911 driver

# Phase 3 — Drivers

- [*] ST7789 (LilyGO T-Display-S3)
- [*] ST7701(S) RGB (Guition ESP32-4848S040)
- [*] JD9165 MIPI-DSI (Guition JC1060P470C, ESP32-P4)
- [ ] GC9A01
- [*] GT911 touch controller (both Guition boards)
- [ ] Buttons — a debounced GPIO source, a `button` hardware device in the
      `modules` document, and the generalisation of `interfaces/input` from the
      single touch handle it is today
- [ ] Encoder — quadrature with and without detents, and the `lv_group` focus
      model ADR 0019 says it needs
- [ ] Analog axes — ADC with a stored calibration curve, for a handbrake or a
      hall-effect paddle

# Phase 4 — Modules

- [*] Dashboard
- [*] Lap Timer
- [*] Reusable telemetry text widgets
- [*] Value modifiers and time transforms
- [*] Value formatting transforms (decimal precision, scale and offset, units)
- [*] Multi-field text composition
- [*] Lap delta readout — authored from a text widget and a centred bar rather
      than a dedicated widget type
- [*] Additional widget types (arc, indicator strip, graph)
- [*] Conditional and animated widget styling (colour, visibility and blink)
- [*] Value-driven colour ramps and linear gradients (rotation and animation
      curves are excluded by decision)
- [*] Uploaded image asset pipeline and image widgets
- [*] Container shapes and slots (an area of a screen that switches what it
      shows), with children clipped to the container unless it says otherwise
- [*] Compressed image packages, image memory bounded by what is drawn, and
      sprite sheets (ADR 0018)
- [*] RGB — WS2812B and SK6812 outputs, each a data pin driving one strip or one
      matrix as separate devices, layers painted over it with the most recently
      lit winning a shared lamp, matrix artwork drawn in the configurator and
      stored in the document (ADR 0030)
- [ ] Bounded declarative value nodes — a fixed set (`min`, `max`, `clamp`,
      `abs`, the sum, difference, product or ratio of two sources, and a
      threshold that selects between two values) evaluated over fields the
      device already holds. Stateless by construction: no accumulation, no
      history, no absolute time. The set grows only by amending its ADR, and the
      configurator evaluates the same set so the canvas agrees with the board.
      This is what replaces SimHub's NCalc and JavaScript formulas, and it is
      the item the largest number of others wait on. Needs an ADR
- [ ] Repeated structures in the contract — an id-plus-overrides shape the
      firmware expands during composition, so a tyre corner is authored once and
      four instances share it. Expansion is static: the pools stay fixed and
      ADR 0015's per-type lifecycle is untouched
- [ ] Colour transparency — the sentinel separated from the value rather than
      packed beside it, taking the schema bump now. `kTransparentColor` stops
      being `0xFFFFFFFF` and becomes a presence flag, so `#FFFFFFFF` with an
      alpha is expressible and a rule can clear a background
- [ ] Button Matrix
- [ ] Uploaded images kept in their original format, so the device scales them
      and a layout transfer carries them — format and decoder undecided
- [ ] Additional widget types — a table, and a track map drawn from the outline
      SimHub sends once per track, with the car at `track.position_percent`.
      Both wait on Phase 7: the table on the relative rows, the map on the
      plugin's one-shot outline frame

Closed by decision rather than deferred, and recorded so they stop being
re-proposed: **animation curves, durations and triggers** — motion comes from
telemetry, and the render skip that makes a dense dashboard hold 60 fps is worth
more than a fade; **stateful values on the device** — stint timers, counters,
rolling averages, min/max hold and best-lap memory are the PC's, and the
`lap_timer` modifier stays as the one exception, because it extrapolates between
packets rather than deriving anything; **a repeater whose instance count varies
at runtime** — a full leaderboard is not worth per-instance widget lifecycle.

The `modifiers` array should shrink to a single optional field to match: it is
declared as four, the binder honours exactly one, and with stateful work closed
there is nothing for the other three to hold.

# Phase 5 — Interaction

Each item needs its own architectural decision before implementation; the
foundation for them landed in Phase 1.

- [*] Touch input subsystem
- [*] Multiple dashboard screens with swipe navigation
- [*] Applying a configuration without restarting
- [*] Configurator undo and redo
- [*] Configurator copy, paste and duplicate
- [*] Configurator multi-select, alignment and grid snapping
- [*] Configurator layer panel with reordering, lock and hide
- [*] Dashboard preview with placeholder values
- [*] Dashboard templates and cross-board layout transfer
- [*] Font library, font picker and automatic font delivery on save
- [*] Dragging a widget into a container on the canvas, and container clipping
      as an authored property (schema 11)
- [*] Drawing a widget with a tool, snapping that reaches the neighbours during a
      resize as well as a move, equal-gap snapping with measurements, and
      context menus on the canvas and the layer list
- [*] Widget templates — one widget saved to the library and drawn onto the
      canvas, beside the dashboards
- [*] Inserting a single screen out of a saved dashboard, transferred to this
      board like any other layout
- [*] A gallery of ready-made dashboards — the bundled template library
- [ ] Preview with live values — a virtual COM port on the PC, with the
      configurator taking the SimHub stream, drawing it, and forwarding it to the
      board. Ranked first among what is left: a rule, a ramp, a graph trace and a
      real string length cannot be judged against a placeholder, and the same
      port resolves the one-process-per-link conflict that also blocks adjusting
      a dashboard while driving
- [ ] Named styles in the configurator — a colour, a face and a size edited once
      and flattened into the document on save. Configurator-side only: reading a
      configuration back from a board stays a lossy recovery path, and the
      project file is the artifact
- [ ] Images delivered from the document on save, the way fonts already are, and
      the staged image set persisted in the project rather than held in memory
      until the app closes
- [ ] Reflow in a cross-board layout transfer
- [ ] Saving a single screen on its own, and templates shared as a file rather
      than through the user data directory
- [ ] Keyboard sibling navigation and a search over the layer list

# Phase 6 — Field maintenance

- [*] OTA partition layout and update path
- [*] A board with no display — the ESP32-S3 DevKitC-1 profile, and the
      single-lamp status light that reports safe mode and upload progress on a
      board that has no other way to say anything
- [ ] Telemetry staleness as a bindable state — a per-field deadline in the
      telemetry state service and synthetic fields for link and game state. Today
      nothing expires a value in a product build (the change stamp is behind
      `PITRIG_DEBUG`), so when the host stops every widget holds its last number
      for as long as the board is powered
- [ ] Crash diagnostics — enable the coredump partition that is already declared
      and sized, and a way to read it back over the link
- [ ] A board that can say it is in trouble on a board that has a screen — safe
      mode initialises no display, and only the DevKitC-1 declares a lamp
- [ ] Firmware version awareness in the configurator, and a schema mismatch that
      degrades to a firmware-update-only session instead of refusing the board

Image signing, secure boot and flash encryption are rejected rather than
deferred: the serial port is physical access, and a board that a stranger cannot
reflash is not the platform this is. ADR 0022's note about moving the partition
table offset applies to nothing that is planned.

# Phase 7 — Telemetry and its source

The catalog stopped at Phase 1 and was never revisited, yet every remaining
dashboard gap is on this side of the link rather than the widget side. The
direction: a first-party SimHub plugin as the reference source, with the
generated `.shsds` profile kept as the no-install fallback.

- [ ] A Pitrig SimHub plugin — removes the per-field NCalc cost, removes the
      manual profile import, removes the Free-tier rate ceiling, and opens a
      frame shape the line protocol cannot express. Its licence is the open
      question: the platform is GPL-3.0-or-later while `configuration/`,
      `telemetry/`, `simhub/` and `docs/` are Apache-2.0 precisely so a
      compatible client can be built, and a plugin is loaded into SimHub's own
      closed process. Decide before anything is published. Needs an ADR
- [ ] Telemetry slots in external RAM, and a reserved block of user-defined
      slots the configurator names locally and the export maps. 227 of 256 are
      spent and the obviously missing families cost more than the 29 that are
      left, so the ceiling stops being a RAM number and the catalog stops being
      the only way to reach a property
- [ ] Opponents as a bounded relative — N cars ahead and N behind plus the
      leader, as ordinary flat catalog fields the plugin fills by sorting. No
      indexed wire format, no repeater, no change to the read path. A full
      twenty-car tower is refused with it, and that is the trade. Names must be
      truncated by the plugin, because a value of 63 bytes or more is dropped by
      the parser rather than shortened, and name rows belong at the `changes`
      rate or the 4848S040's 460800 link will not hold them. Needs an ADR
- [ ] The same fixed-ring shape for the two other list-shaped gaps: the last
      three race-control messages, and three weather forecast points
- [ ] The cheap missing families, once the ceiling is lifted — spotter and
      proximity, car and driver identity, tyre compound, dirt and age, optimal
      and theoretical lap references
- [ ] An audit of the 227 mapped properties against a live SimHub — a mapping
      that names a property SimHub does not expose fails silently and reads as a
      field the game does not send
- [ ] The seven source-formatted text fields (speed, rpm, brake bias, the aid
      levels) given numeric twins, so a transform can act on them and the device
      stops depending on how the host formatted a number
- [ ] A one-shot non-telemetry frame on the link, for the track outline the map
      widget needs — neither a telemetry line nor an asset package, so it is a
      third payload class. Needs an ADR

Wireless is not on this list. ADR 0029 fixed the board at one link, the ESP32-P4
flagship has no radio, and no part of the plan needs a second one.

# Phase 8 — Distribution

Two audiences, sequenced: the author who builds a dashboard from a blank screen
is served today, and the person who wants to install one and change three
colours is served by nothing at all. A downloaded dashboard fails on a missing
face or a missing image and the recipient cannot repair it, which is why the
bundle comes before the gallery.

- [ ] A dashboard bundle — one file carrying the document, the converted images
      and any imported font faces, with bundled and Google families left as
      references the recipient resolves locally by id. Faces the project did not
      author do not travel, so no licence the repository does not track is
      redistributed. Needs an ADR
- [ ] Template import and export as a file, on top of the bundle
- [ ] A gallery a user can browse from inside the configurator
- [ ] Continuous integration on pull requests and on `main` — the workflow
      triggers only on a push to `release`, and no `release` branch exists
- [ ] A compatibility policy, a changelog and a release runbook
- [ ] Issue and pull-request templates, `SECURITY.md`, a code of conduct and a
      named support channel
- [ ] A troubleshooting reference — the user-facing documentation lives on the
      site, in another repository, and neither side links to the other
- [ ] Signed and notarized packages, and application self-update
