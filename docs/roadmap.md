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
- [*] Generated configuration contract (schema 12)
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
- [*] Container shapes and slots (an area of a screen that switches what it
      shows), with children clipped to the container unless it says otherwise
- [ ] Additional widget types (table, track map — the outline SimHub itself
      generates, sent over the link once per track and held in RAM rather than
      uploaded as an asset, with the car placed by `track.position_percent`)
- [ ] Colour transparency — needs an encoding that keeps the transparent
      sentinel distinguishable from an opaque white
- [ ] Uploaded images kept in their original format (PNG or SVG) instead of
      converted, so the device scales them and a layout transfer carries them —
      the format and what decodes it are undecided
- [*] Compressed image packages — pixels stored deflated and inflated once at
      startup, so the artwork's size lands on flash instead of on the frame.
      Real dashboard artwork stores at a fifth to a third of raw, with the draw
      path, the external RAM and the P4 accelerator all unchanged (indexed
      colour is excluded by decision: it trades frames and the accelerator for
      storage this buys back for nothing — ADR 0018)
- [*] Image memory bounded by what is drawn — external RAM holds only the images
      the running configuration shows rather than every one the package carries,
      and artwork with no transparent pixel is offered a format without an alpha
      plane, which is a third off flash and external RAM at once
- [*] Sprite sheets — many pictures in one image, a widget drawing one of them.
      Spends one of the 32 package entries rather than one per icon, and lets a
      single widget switch its picture from telemetry instead of stacking one
      widget per state. Frames are uniform and stored whole, back to back, which
      is the only layout contiguous in every colour format — so a frame is a
      pointer step and the P4 accelerator is untouched (an arbitrary rectangle
      atlas was rejected for that reason)
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
- [ ] A gallery of ready-made dashboards

# Phase 6 — Field maintenance

- [*] OTA partition layout and update path
