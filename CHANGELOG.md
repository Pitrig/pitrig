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
