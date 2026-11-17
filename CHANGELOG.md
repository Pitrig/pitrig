# Changelog

Changes to Pitrig, newest first.

Each entry is one short line: what changes for the user, without the details.
It opens with a bold label: `Configurator`, `SimHub plugin`, `Development`,
`All boards`, `Display boards`, or a board's name, several joined by commas. A
released heading names its firmware, as in `## 0.3.1 — 2026-11-02 — firmware 0.3.1`.
The configurator shows a board the entries for it, and its build fails on an
entry without a known label.

| Number | Source | Governs |
| --- | --- | --- |
| Configurator | `configurator/package.json` | The desktop application, and the release tag |
| Firmware | `firmware/version.txt` | The board image, reported by `@PR:INFO` |
| Configuration schema | `configuration/configuration_schema.json` | The documents a board accepts |

A firmware accepts one configuration schema. After a schema change the board
shows its built-in dashboard until its configuration is saved again; **Update
board** does that for you, and nothing is erased. A partition table change needs
a cable flash and erases the configuration, fonts and images. The first line of
a release says when either applies.

## Unreleased

**Added**

- **Configurator.** **Share…** saves a dashboard with its images and fonts as one `.pitrigdash` file; **Open…** opens it.
- **Configurator.** `Save to board` installs the images a dashboard uses.
- **Configurator.** `Save to board` downloads missing Google fonts by itself.
- **Configurator.** New starter dashboard: GF Rally Mode, 480×480.

**Changed**

- **Guition ESP32-4848S040.** No more tearing; the screen refreshes at 60 Hz.
- **Guition ESP32-4848S040.** Values reach the screen faster: 17 ms instead of 54.
- **Display boards.** Ring arcs that change colour redraw faster.
- **Display boards.** Circles, rings and arcs draw faster.
- **Display boards.** The boot animation is smoother and lighter.
- **Configurator.** Images stay in the PC image library until `Save to board`.

**Fixed**

- **Configurator.** Images with soft edges look the same on the board as on the canvas.
- **Configurator.** `Save to board` puts back fonts and images the board lost.
- **Configurator.** A configuration without a link speed no longer cuts off the Guition ESP32-4848S040.
- **Guition JC1060P470C.** After a dashboard change the board keeps the faster drawing mode.
- **Development.** The Guition ESP32-4848S040 debug image starts with a display again.
- **Development.** Build tools no longer use a vulnerable `minimatch`.

**Removed**

- **Development.** The Guition JC1060P470C full-screen render mode.

## 0.3.2 — 2026-11-16 — firmware 0.3.1

Same firmware and schema: boards need no update.

**Added**

- **Configurator, SimHub plugin.** Anonymous usage reports; one switch on the Info page turns them off.

**Removed**

- **Configurator.** No more builds for Intel Macs and Linux.

## 0.3.1 — 2026-11-02 — firmware 0.3.1

Same schema: a board update keeps the configuration. In SimHub, switch off any
Custom Serial device on the board's port.

**Added**

- **SimHub plugin.** New plugin page with Status, Settings, Buttons and About tabs.
- **SimHub plugin.** The plugin works out more values: positions, fuel, deltas, sectors, pit call.
- **All boards, SimHub plugin.** Seven new fields: damage grades, repair time, track condition, rain forecast.
- **Configurator.** **Units** in the inspector: speed, temperature, pressure, fuel and revs.

**Changed**

- **All boards.** Room for 350 telemetry fields instead of 256.
- **Configurator.** Bundled dashboards show tyre pressure in psi.
- **SimHub plugin.** Settings apply at once and keep the session.

**Fixed**

- **Guition JC1060P470C.** Wide values no longer leave digits beside their widget.
- **SimHub plugin.** Tyre and oil pressure no longer depend on SimHub's display units.

**Removed**

- **Configurator.** The Custom Serial Device profile and its export.

## 0.3.0 — 2026-10-27 — firmware 0.3.0

New schema 27: after the update the board shows its built-in dashboard until
its configuration is saved again. **Update board** does this for you.

**Added**

- **Configurator.** **Update board** backs up, installs, restarts and restores the configuration in one step.
- **Configurator.** Checks for updates daily and installs itself on Windows.
- **Configurator.** **Download and update** gets the firmware for the connected board.
- **Configurator.** **Update plugin** replaces an old Pitrig plugin in SimHub.
- **All boards, SimHub plugin.** PC buttons and a switch change screens and pages, dim the display and LEDs.
- **All boards, SimHub plugin.** Screens can come forward on a game event, such as the pit lane.
- **Configurator.** **Buttons** page: name, assign and test up to 16 buttons.
- **All boards, Configurator.** A slot can go back to its first page after a while.
- **All boards.** Conditions can follow one button with `bit_set`.
- **SimHub plugin.** The plugin finds the board and feeds it; the Windows installer adds it to SimHub.
- **Configurator.** The configurator works while SimHub runs.
- **Configurator.** Live values in the previews and the telemetry catalog.
- **All boards, SimHub plugin.** New field `engine.shift_progress` for shift-light bars.
- **All boards, Configurator.** An LED layer covers any set of lamps, in several parts.
- **All boards, Configurator.** LED animations drawn frame by frame.
- **All boards.** Five more LED animations: comet, theater chase, sparkle, strobe and bounce.
- **All boards.** **Switch-off margin** stops LED layers flickering at a threshold.
- **Configurator.** A large lamp preview with a simulator; **Show on the board** tries it on the real LEDs.
- **Configurator.** The layer list groups layers and marks problems.
- **All boards, SimHub plugin.** Game data for ACC, AC, iRacing and LMU: damage, weather, electronics, hybrid, penalties.
- **Development.** A development build of the plugin writes a trace log.

**Changed**

- **SimHub plugin.** Shift points follow the car's own values where the game reports them.
- **Configurator.** The shift-lights preset uses `engine.shift_progress`.
- **Configurator.** The lamp preview shows colours at full strength.
- **All boards, Configurator.** Strip layers use `parts` instead of `from` and `count`; files convert on open.
- **Configurator.** Race DDU timers show `00:00.000` instead of `N/A` before data.
- **Configurator.** The dashboard-only SimHub profile includes speed and lap time when needed.

**Fixed**

- **SimHub plugin.** 43 fields that were always empty now carry game data.
- **All boards, Configurator.** A blinking LED layer can cover the layers under it (**Covers**).
- **SimHub plugin.** Class position matches position in a single-class race.
- **SimHub plugin.** Fuel fields stay empty until measured, so fuel warnings do not fire on the grid.
- **SimHub plugin.** `session.time_remaining` is empty before a lap race starts.
- **SimHub plugin.** A first lap or sector counts as a personal best.
- **Configurator.** Commands are sent again when the board is busy.
- **Configurator.** The safe-mode notice no longer squeezes the page.
- **Configurator.** Long property names wrap instead of being cut.
- **Configurator.** Dependencies updated for published vulnerabilities.

## 0.2.0 — 2026-10-18 — firmware 0.2.0

Same schema: a board update keeps everything. Export the SimHub profile again
for the new fields.

**Added**

- **All boards, Configurator.** Shift lights per gear: `engine.shift_percent` and `engine.redline_reached`.
- **All boards, Configurator.** Pace status for the lap and sectors: yellow, green, purple.
- **All boards, Configurator.** Fuel left at the finish and a pit-now flag.
- **All boards, Configurator.** Tyre and brake averages over the last laps.
- **Configurator.** The profile export sets the fuel reserve and the laps to average.

**Changed**

- **Configurator.** The shift-lights preset follows the current gear's shift point.
- **Configurator.** `session.lap.last_delta_best` compares with the best before the last lap.
- **Configurator.** Gaps and positions come from SimHub's leaderboard; class position works in multi-class.
- **Configurator.** The sector delta is live.
- **Configurator.** Fuel to add keeps the reserve and fits the tank.
- **Configurator.** Computed fields send nothing while no game runs.

**Fixed**

- **Configurator.** The black-and-orange mechanical flag reaches the board.
- **Configurator.** Eleven fields that were always empty now carry values.
- **Configurator.** Zero sector and best times read as empty.
- **SimHub plugin.** 60 Hz fields update on every tick and never stay stale.

## 0.1.1 — 2026-10-04 — firmware 0.1.1

Same schema: a board update keeps everything.

**Changed**

- **Configurator.** Own dialogs and drop-down lists; destructive actions show a red button.
- **All boards.** Smoother LED fades.
- **Configurator.** The Windows installer is named `Pitrig-Setup-<version>.exe`.

**Fixed**

- **Configurator.** Drop-down lists on Windows open after a dialog.
- **Configurator.** Dependencies updated for a published vulnerability.

## 0.1.0 — 2026-09-14

First release, schema 26: an ESP32 board becomes a sim racing dashboard.

**Added**

- Four boards: LilyGO T-Display-S3, Guition ESP32-4848S040, Guition JC1060P470C, ESP32-S3-DevKitC-1 (LEDs only).
- A dashboard editor with widgets, conditional styles, screens and a live preview.
- A template library and layout transfer between boards.
- A font library, sent to the board on save.
- 228 telemetry fields from a SimHub Custom Serial profile.
- RGB LED strips and matrices.
- One USB cable for telemetry, configuration and a gamepad.
- Firmware updates over USB, with rollback.

**Known limits**

- No buttons or encoders yet.
- Nothing is signed: on macOS run `xattr -dr com.apple.quarantine` once.
- One serial port, one program: close the configurator before the game.
