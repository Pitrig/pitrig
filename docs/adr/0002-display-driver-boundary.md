# ADR 0002: Display Driver Boundary and Runtime Selection

## Context

SimCore needs to render with LVGL on boards using different display transports,
including the LilyGO T-Display-S3 i80/ST7789 display and the Guition
ESP32-4848S040 RGB/ST7701(S) display, while keeping the firmware core and
dashboard modules independent from board-specific hardware.

## Decision

Keep board initialization in dedicated drivers. Every supported display driver
is linked into the firmware and exposes an immutable descriptor containing its
initialization callbacks. Application board configuration identifies the
descriptor to select during startup.

The display component owns LVGL initialization and creates the logical display
during `simcore::run()`. SimCore loads application configuration and asks the
platform board registry to resolve the configured identifier. The registry
contains concrete-driver composition; the core and display component depend
only on the generic display interface. The display component adapts
command-driven and RGB panels to the corresponding `esp_lvgl_port` registration
path without knowing a concrete board or controller.

## Consequences

- Board pin assignments and ST7789 initialization remain outside the firmware core.
- ST7701(S) commands, RGB timing, framebuffer allocation, and Guition pin
  assignments remain inside the Guition driver.
- The ESP-IDF application entry point only calls `simcore::run()`.
- Modules use the display component and do not depend on the selected driver.
- Rendering code can be reused with another LVGL-compatible display.
- Supporting another board requires a driver descriptor and one composition
  mapping rather than changes to SimCore or rendering modules.
- LVGL is owned by the display component and is not initialized by the hardware driver.
- All supported drivers remain available in one firmware image.
- Exactly one configured driver is initialized during startup.
- Board and driver selection use the same application configuration source as
  modules and dashboard widgets.
