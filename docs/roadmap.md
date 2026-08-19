The dashboard authoring items in Phases 4 and 5 come from the SimHub comparison
in [dashboard-editor-parity.md](dashboard-editor-parity.md).

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
- [*] Generated configuration contract (schema 10)
- [*] Screen as an explicit composition primitive
- [*] Compile-time widget type descriptors
- [*] Double-buffered runtime configuration ownership

# Phase 2 — Hardware

- [ ] GPIO
- [ ] SPI
- [ ] I2C
- [*] Display interface
- [*] Input interface (pointer; buttons and encoders still owed)

# Phase 3 — Drivers

- [*] ST7789 (LilyGO T-Display-S3)
- [*] ST7701(S) RGB (Guition ESP32-4848S040)
- [*] JD9165 MIPI-DSI (Guition JC1060P470C, ESP32-P4)
- [ ] GC9A01
- [*] GT911 touch controller (both Guition boards)
- [ ] Buttons
- [ ] Encoder

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
- [*] Container shapes and slots (an area of a screen that switches what it shows)
- [ ] Additional widget types (table, track map — the outline SimHub itself
      generates, sent over the link once per track and held in RAM rather than
      uploaded as an asset, with the car placed by `track.position_percent`)
- [ ] Colour transparency — needs an encoding that keeps the transparent
      sentinel distinguishable from an opaque white
- [ ] Uploaded images kept in their original format (PNG or SVG) instead of
      converted, so the device scales them and a layout transfer carries them —
      the format and what decodes it are undecided
- [ ] Button Matrix
- [ ] RGB

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
- [ ] Dragging a widget into a container on the canvas (the layer panel already
      reparents)
- [ ] Preview with live values — a virtual COM port on the PC, with the
      configurator taking the SimHub stream, drawing it, and forwarding it to the
      board
- [ ] Reflow in a cross-board layout transfer
- [ ] Saving and inserting a single screen, and templates shared as a file rather
      than through the user data directory
- [ ] A gallery of ready-made dashboards

# Phase 6 — Field maintenance

- [*] OTA partition layout and update path
