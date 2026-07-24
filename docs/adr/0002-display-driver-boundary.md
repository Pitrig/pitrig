# ADR 0002: Display Driver Boundary

## Context

SimCore needs to render with LVGL on the LilyGO T-Display-S3 while keeping the firmware core and dashboard modules independent from board-specific hardware.

## Decision

Keep board initialization in a dedicated driver. The selected driver implements the display interface and provides hardware handles and display properties to the display component. The display component owns LVGL initialization and creates the logical display during `simcore::run()`.

## Consequences

- Board pin assignments and ST7789 initialization remain outside the firmware core.
- The application entry point only starts SimCore and does not compose display hardware.
- Modules use the display component and do not depend on the selected driver.
- Rendering code can be reused with another LVGL-compatible display.
- Supporting another board requires a driver that provides the same compile-time contract rather than changes to SimCore or rendering modules.
- LVGL is owned by the display component and is not initialized by the hardware driver.
