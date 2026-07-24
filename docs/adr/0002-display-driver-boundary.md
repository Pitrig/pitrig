# ADR 0002: Display Driver Boundary

## Context

SimCore needs to render with LVGL on the LilyGO T-Display-S3 while keeping the firmware core and dashboard modules independent from board-specific hardware.

## Decision

Keep board initialization in a dedicated ESP-IDF driver component. The selected driver provides hardware handles and display properties through the SimCore display-driver contract. The SimCore display module owns LVGL initialization and creates the logical display during `simcore::run()`.

## Consequences

- Board pin assignments and ST7789 initialization remain outside the firmware core.
- The application entry point only starts SimCore and does not compose display hardware.
- Rendering code can be reused with another LVGL-compatible display.
- Supporting another board requires a driver that provides the same compile-time contract rather than changes to SimCore or rendering modules.
- LVGL is the current platform boundary between display drivers and rendering modules.
