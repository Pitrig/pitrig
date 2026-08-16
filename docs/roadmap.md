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
- [*] Generated configuration contract (schema 3)
- [*] Screen as an explicit composition primitive
- [*] Compile-time widget type descriptors
- [*] Double-buffered runtime configuration ownership

# Phase 2 — Hardware

- [ ] GPIO
- [ ] SPI
- [ ] I2C
- [*] Display interface
- [ ] Input interface

# Phase 3 — Drivers

- [*] ST7789 (LilyGO T-Display-S3)
- [*] ST7701(S) RGB (Guition ESP32-4848S040)
- [*] JD9165 MIPI-DSI (Guition JC1060P470C, ESP32-P4)
- [ ] GC9A01
- [ ] Touch controller
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
- [*] Value-driven colour ramps and linear gradients (rotation, opacity and
      animation curves are excluded by decision)
- [ ] Uploaded image asset pipeline and image widgets
- [ ] Button Matrix
- [ ] RGB

# Phase 5 — Interaction

Each item needs its own architectural decision before implementation; the
foundation for them landed in Phase 1.

- [ ] Touch input subsystem
- [ ] Multiple dashboard screens with navigation
- [*] Applying a configuration without restarting
- [*] Configurator undo and redo
- [*] Configurator copy, paste and duplicate
- [*] Configurator multi-select, alignment and grid snapping
- [*] Configurator layer panel with reordering, lock and hide
- [*] Dashboard preview with mock telemetry values
- [ ] Dashboard templates and cross-board layout transfer

# Phase 6 — Field maintenance

- [ ] OTA partition layout and update path
