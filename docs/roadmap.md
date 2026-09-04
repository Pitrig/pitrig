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
- [*] Generated configuration contract
- [*] Screen as an explicit composition primitive
- [*] Compile-time widget type descriptors
- [*] Double-buffered runtime configuration ownership

# Phase 2 — Hardware

- [ ] GPIO
- [ ] SPI
- [ ] I2C
- [*] Display interface
- [*] Input interface (pointer; buttons and encoders still owed)
- [*] LED interface and the RMT driver behind it

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
- [*] Container shapes and slots (an area of a screen that switches what it
      shows), with children clipped to the container unless it says otherwise
- [ ] Additional widget types — a table, and a track map drawn from the outline
      SimHub sends once per track, with the car at `track.position_percent`
- [ ] Colour transparency — needs an encoding that keeps the transparent
      sentinel distinguishable from an opaque white
- [ ] Uploaded images kept in their original format, so the device scales them
      and a layout transfer carries them — format and decoder undecided
- [*] Compressed image packages, image memory bounded by what is drawn, and
      sprite sheets (ADR 0018)
- [ ] Button Matrix
- [*] RGB — WS2812B and SK6812 outputs, each a data pin driving one strip or one
      matrix as separate devices, layers painted over it with the most recently
      lit winning a shared lamp, matrix artwork drawn in the configurator and
      stored in the document (ADR 0030)

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
- [ ] Preview with live values — a virtual COM port on the PC, with the
      configurator taking the SimHub stream, drawing it, and forwarding it to the
      board
- [ ] Reflow in a cross-board layout transfer
- [*] Widget templates — one widget saved to the library and drawn onto the
      canvas, beside the dashboards
- [*] Inserting a single screen out of a saved dashboard, transferred to this
      board like any other layout
- [ ] Saving a single screen on its own, and templates shared as a file rather
      than through the user data directory
- [*] A gallery of ready-made dashboards — the bundled template library

# Phase 6 — Field maintenance

- [*] OTA partition layout and update path
- [*] A board with no display — the ESP32-S3 DevKitC-1 profile, and the
      single-lamp status light that reports safe mode and upload progress on a
      board that has no other way to say anything
