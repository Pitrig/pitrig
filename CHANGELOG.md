# Changelog

Notable changes to Pitrig, newest first. Entries group what changed under
**Added**, **Changed**, **Fixed** and **Removed**, and call out anything that
costs a board its stored configuration.

Three version numbers move independently:

| Number | Source | Governs |
| --- | --- | --- |
| Configurator | `configurator/package.json` | The desktop application, and the release tag |
| Firmware | `firmware/version.txt` | The board image, reported by `@PR:INFO` |
| Configuration schema | `configuration/configuration_schema.json` | The documents a board accepts |

Until 1.0.0 a minor bump may break compatibility. Two kinds of change cost more
than a download, and every entry below says when one applies:

A firmware image accepts **one** configuration schema version, exactly. Install
an image built against a newer schema and every stored document reads back as
`unsupported_schema`; the board draws its built-in dashboard until the
configurator saves the documents again. Nothing is erased.

A change to the **partition table** cannot travel over serial. It needs a cable
and a full erase, and it takes the stored configuration, the font package and
the image package with it.

## Unreleased

**Configuration schema 27.** A board updated to this firmware refuses its stored
documents and draws its built-in dashboard until the configurator saves them
again; nothing is erased. The configurator converts its own files and a board's
documents on the way in, and connects to a board still on 0.2.0 to read its
configuration and update its firmware, but writes nothing to it before that:
connect, install the firmware from the Firmware page, then **Save to board**.
The partition table is the same. The telemetry catalog grows from 251 to 252
fields without moving an identifier.

**Added**

- The Pitrig plugin for SimHub feeds the board by itself: it finds the board on
  USB, sends only the fields its dashboard and modules use, and needs no profile
  to import and no port to pick. The Windows installer adds it to SimHub.
  After a restart of SimHub or of the board it resumes at once with the fields it
  sent before, and a board slow to take data for a moment misses updates rather
  than receiving them late.
- A development build of the plugin, built without `-c Release`, writes a trace
  to SimHub's `Logs\Pitrig-trace.log` and shows each board's state, the longest
  pauses and the repeated busy answers in its panel. The released plugin carries
  none of it.
- The configurator connects while SimHub runs: it takes the board over from the
  plugin and passes the telemetry on, and gives the board back when it
  disconnects. A Guition ESP32-4848S040 is learned the first time the
  configurator connects to it.
- Live values in the dashboard and lamp previews and in the telemetry catalog
  whenever SimHub runs.
- `engine.shift_progress`, a shift-light bar from the car's first light to its
  full bar in the current gear.
- An LED layer on a strip covers any set of lamps, written like `3-6, 27-30` or
  clicked on the map, instead of one run, and each part can run the other way:
  one layer now flashes the flags at both ends of a wheel. **Spread** joins the
  parts into one line for a fill, or paints the effect in each part on its own.
  The layer list offers to merge layers that differ only in their lamps. The
  lamps of a new layer are picked on the map the same way, and on a matrix the
  map paints the selected layer's pixels.
- Strips play animations drawn by hand, frame by frame on a frames-by-lamps grid
  in the Pictures tab, looping or with the frame chosen by a value mapped
  through the layer's range — a shift-light picture per step of the revs.
- Five more animations: comet, theater chase, sparkle, strobe and bounce, with
  **Span** setting the tail, the gap or the block.
- **Switch-off margin** on a layer's gate: on at 94, off only below 92, so revs
  hovering on a threshold cannot flicker a layer.
- The Modules page draws every lamp large, numbered and where it is mounted, and
  lights it the way the board does: from SimHub while a game or a replay sends
  values, otherwise from a simulator with a switch for every flag and warning
  the layers watch and a slider for every value they read. **Show on the
  board** sends the simulator's values to the connected board instead of
  SimHub's, so the real lamps can be tried without a game.
- The layer list groups layers by what they watch and shows the lamps each one
  covers. Several layers can be picked and edited, duplicated or removed
  together, and a layer is marked when it covers no lamp, repeats another, is
  never seen, or lets the layers under it show between flashes. Undo, redo,
  duplicate and delete work from the keyboard on that page.

**Changed**

- With the plugin, `engine.shift_rpm`, `engine.shift_percent` and
  `engine.redline_reached` follow the car's own shift points — from iRacing, F1
  and RaceRoom where the game reports them, otherwise from SimHub's car
  settings, which the profile keeps using.
- The shift-lights preset steps across `engine.shift_progress` and flashes on
  `engine.redline_reached`, and the gear text colours by the same bar.
- A dashboard-only SimHub profile now includes `vehicle.speed` for a text source
  left on its default, and the lap time for any modifier.
- The lamp preview shows colours at full strength rather than scaled by the
  strip's brightness, so a dimmed strip still reads on screen.
- A strip layer's `from` and `count` became `parts`; documents and files are
  converted when they are opened.

**Fixed**

- The configurator sends a command again when the board answers that it is busy.
  A board still finishing one reply refuses the next command for a few
  milliseconds, which could fail a connection or a read of its configuration.
- A flashing LED layer can hide the layers under it between flashes. Its
  background now stays lit through the dark half of a blink, and the layer
  editor offers it beside Blink as **Covers**. The shift-lights limiter, ABS,
  traction control and the flashing flags of the presets use a black one, so
  the limiter no longer uncovers the whole shift bar under it. A layer added
  before needs the setting switched on, and the board needs the new firmware.
- In a race of one class `session.class_position` is the game's own position, the
  same as `session.position`. In ACC, SimHub's leaderboard put the player one
  place behind it, so a dashboard showed class 23 beside position 22. Export the
  SimHub profile again to get the fix there too.

## 0.2.0 — 2026-10-18

Configuration schema 26, unchanged, and the partition table is the same: the
firmware installs over serial from the Firmware page and every stored document,
font and image survives. The telemetry catalog grows from 228 to 251 fields
without moving an identifier, so an older board ignores the new fields and reads
every other one as before. Export the SimHub profile again and import it into
SimHub to get the new fields and the fixes below.

**Added**

- Shift lights per gear: `engine.shift_percent` is the revs against the current
  gear's shift point from SimHub's car settings, and `engine.redline_reached`
  says the shift point is reached.
- Pace statuses for the current lap, the last lap and the three sectors —
  1 slower than the personal best, 2 personal best, 3 best in class this
  session, 4 invalid lap — so a dashboard colours yellow, green and purple with
  plain rules. `session.lap.delta_session_best` is the estimated lap against the
  fastest lap in the class, and the all-time best lap and its live delta are
  fields of their own.
- `vehicle.fuel.at_finish`, the fuel left at the flag or missing for it, and
  `vehicle.fuel.pit_now`, raised on the last lap the car can still pit to reach
  the finish.
- Tyre pressure, tyre temperature and brake temperature averaged over the last
  laps on track, restarted on leaving the pits and in a new session.
- The SimHub profile export takes the fuel reserve in laps and the laps the
  averages cover.

**Changed**

- The shift-lights LED preset follows the current gear's shift point instead of
  the maximum revs, and the gear text colours by it.
- `session.lap.last_delta_best` compares the last lap with the best that stood
  before it, so a new best reads negative; the first lap of a session reads
  empty.
- The gaps ahead, behind and to the leader, the class position and the starting
  position come from SimHub's leaderboard; the class position now works in a
  multi-class session.
- The profile's sector delta is the live time gained or lost in the current
  sector, as the plugin already sent.
- `vehicle.fuel.to_add` keeps the reserve and never asks for more than the tank
  holds; fuel and laps estimates fall back to the last lap before a best lap
  exists.
- Computed fields send nothing while no game runs. Several of their formulas
  failed in SimHub then and were suspended for 30 seconds.
- Fields with no generic SimHub source are labelled `game_specific`.

**Fixed**

- The black-and-orange mechanical flag never reached the board: its mapping
  named a SimHub property that does not exist. It reads `Flag_Orange`, which
  ACC, AC, AC EVO and AC Rally set.
- Eleven more fields named properties SimHub does not have and never carried a
  value: fuel used this lap, energy level and percentage, in the pit box,
  session best lap, current sector time, sector three, timed session, the
  chequered flag shown, starting position and, in the profile, the gap to the
  leader.
- Zero sector and best times read as missing instead of `00:00.000`.
- The plugin ran its 60 Hz fields on about every other tick, folded the
  start-finish reset into the sector delta, and repeated an empty value only
  once, so a lost datagram could leave a stale value on the board.

## 0.1.1 — 2026-10-04

Configuration schema 26, unchanged, and the partition table is the same: the
firmware installs over serial from the Firmware page and every stored document,
font and image survives.

**Changed**

- The configurator draws its own confirmation dialogs and drop-down lists
  instead of the operating system's, and styles checkboxes, radio buttons,
  sliders, number fields and scrollbars to match. Destructive confirmations —
  delete, erase, reset — show a red button and focus Cancel.
- LED fades are smoother.
- The Windows installer is named `Pitrig-Setup-<version>.exe`.

**Fixed**

- On Windows, every drop-down list stopped opening after a confirmation dialog,
  for example after applying a dashboard template with a draft open.
- Dependencies updated, including the transitive `fast-uri` 3.1.8 for a
  published vulnerability.

## 0.1.0 — 2026-09-14

First release. Configuration schema 26.

Turns an off-the-shelf ESP32 board into a sim racing dashboard: flash it from
the browser, lay the screen out by dragging widgets, and feed it live telemetry
from SimHub over the same USB cable.

**Added**

- Four boards: LilyGO T-Display-S3, Guition ESP32-4848S040, Guition
  JC1060P470C and the Espressif ESP32-S3-DevKitC-1. The DevKitC-1 has no
  display and drives LED strips and matrices.
- Dashboard editor with text, shape, bar, arc, indicator, graph and image
  widgets, containers and slots, conditional styling, colour ramps and
  gradients, undo and redo, multi-select, alignment and snapping, and a live
  preview.
- Multiple screens with swipe navigation, and touch input where the board has
  it.
- A bundled dashboard library, widget templates, and layout transfer between
  boards of different sizes.
- Font library with delivery to the board on save.
- 228 telemetry fields, fed by a SimHub Custom Serial Device profile the
  configurator exports.
- Addressable RGB strips and matrices.
- Composite USB: one cable carries the telemetry and configuration link and
  enumerates a gamepad beside it.
- Firmware updates over the same serial link, into a second slot with rollback
  if the new image cannot be talked to.
- Configuration split into three documents — `dashboard`, `modules` and
  `protocol` — transferred, stored and applied on their own, with the dashboard
  applied to the running composition without a restart.

**Known limits**

- Buttons, switches and encoders are not implemented, so the gamepad the board
  enumerates reports nothing yet. The free GPIOs are listed per board in the
  README, but nothing reads them.
- Packages are not signed. macOS needs `xattr -dr com.apple.quarantine` on the
  application once after installing.
- The SimHub plugin is not part of this release. Telemetry reaches the board
  through the exported Custom Serial profile; `session.gap_leader` has no
  generic SimHub property behind it and stays empty.
- One serial port admits one process: close the configurator before starting
  the game.
