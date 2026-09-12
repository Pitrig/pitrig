Editor gaps against SimHub are in
[dashboard-editor-parity.md](dashboard-editor-parity.md).

# Phase 1 — Foundation

- [*] Firmware builds
- [*] Boot sequence
- [*] Logging
- [*] Persistent runtime configuration
- [*] Configurator read, validate, save, reset and reboot
- [*] Font asset pipeline
- [*] Event bus
- [*] Static service composition
- [*] Module manager
- [*] Scheduler ownership
- [*] Telemetry catalog, registry and ingestion
- [*] Performance service and debug overlay
- [*] Generated configuration contract
- [*] Screens as a composition primitive
- [*] Widget type descriptors
- [*] Live configuration swap
- [ ] Generated protocol tokens

# Phase 2 — Hardware

- [*] Display interface
- [*] Input interface
- [*] LED interface
- [ ] GPIO
- [ ] SPI
- [ ] I2C
- [ ] Platform bus service

# Phase 3 — Drivers

- [*] ST7789 (LilyGO T-Display-S3)
- [*] ST7701S RGB (Guition ESP32-4848S040)
- [*] JD9165 MIPI-DSI (Guition JC1060P470C)
- [*] GT911 touch
- [ ] GC9A01
- [ ] Buttons
- [ ] Switches
- [ ] Encoders

# Phase 4 — Modules

- [*] Dashboard
- [*] Lap timer
- [*] Text widgets
- [*] Value modifiers and time transforms
- [*] Number formatting
- [*] Multi-field text composition
- [*] Bar, arc, indicator and graph widgets
- [*] Conditional styling
- [*] Colour ramps and gradients
- [*] Image widgets and sprite sheets
- [*] Containers and slots
- [*] RGB strips and matrices
- [*] Composite USB — telemetry and gamepad on one cable
- [ ] Value nodes — min, max, clamp, abs, arithmetic, threshold
- [ ] Repeated structures
- [ ] Colour transparency
- [ ] Button matrix
- [ ] On-screen button and slider
- [ ] Gamepad report mapping
- [ ] Images kept in their original format
- [ ] Table widget
- [ ] Track map widget

# Phase 5 — Interaction

- [*] Touch input
- [*] Multiple screens with swipe navigation
- [*] Applying a configuration without restarting
- [*] Undo and redo
- [*] Copy, paste and duplicate
- [*] Multi-select, alignment and snapping
- [*] Layer panel
- [*] Preview with placeholder values
- [*] Templates and cross-board layout transfer
- [*] Font library and delivery on save
- [*] Containers on the canvas
- [*] Drawing tools and context menus
- [*] Widget templates
- [*] Inserting a screen from a saved dashboard
- [*] Bundled dashboard library
- [*] Live values in the preview
- [ ] Setting a telemetry value by hand in the preview
- [ ] Named styles
- [ ] Image delivery on save
- [ ] Reflow on layout transfer
- [ ] Single screen export
- [ ] Keyboard navigation and layer search

# Phase 6 — Field maintenance

- [*] OTA updates
- [*] Display-less board
- [ ] Telemetry staleness
- [ ] Crash diagnostics
- [ ] Safe mode shown on screen
- [ ] Firmware version awareness
- [ ] Firmware downloaded from the latest release and installed in the app

# Phase 7 — Telemetry

- [*] SimHub plugin
- [ ] Telemetry slots in external RAM
- [ ] User-defined slots
- [ ] Relative — cars ahead and behind
- [ ] Race control messages
- [ ] Weather forecast
- [ ] Spotter and proximity
- [ ] Car and driver identity
- [ ] Tyre compound, dirt and age
- [ ] Numeric twins for the text fields
- [ ] Mapping audit against a live SimHub
- [ ] Track outline

# Phase 8 — Distribution

- [ ] Dashboard bundle
- [ ] Sharing a dashboard as a file
- [ ] In-app gallery
- [ ] CI on pull requests
- [ ] Compatibility policy and changelog
- [ ] Issue templates and support channel
- [ ] Troubleshooting reference
- [ ] Signed packages and self-update

# Not planned

- Analog inputs
- Animation curves
- Stateful values on the device
- Runtime repeater
- Wireless
- Secure boot and image signing
