# ADR 0002: Display Driver Boundary and Runtime Selection

Status: Accepted; the original "every supported display driver is linked into
the firmware" wording was corrected once the P4 target began linking only its
own board drivers.

## Context

SimCore needs to render with LVGL on boards using different display transports,
including the LilyGO T-Display-S3 i80/ST7789 display and the Guition
ESP32-4848S040 RGB/ST7701(S) display, while keeping the firmware core and
dashboard modules independent from board-specific hardware.

The desktop configurator must identify connected hardware before any user
configuration exists. The stable board identifier is sufficient for the
configurator to resolve its own supported board profile, including logical
display size.

## Decision

Keep board initialization in dedicated drivers. Each driver exposes only its
stable name, initialization callback, and display-ready callback. What the
initialization callback returns is deliberately an ESP-IDF shape — the
`esp_lcd` panel and panel-IO handles plus the geometry and buffering facts the
LVGL port needs — because the display component registers exactly that with
`esp_lvgl_port`; the interface says so, and UI, modules and configuration must
not depend on it (ADR 0019 makes the same trade for the touch handle). A build links
the drivers its target can carry — `firmware/CMakeLists.txt` selects them per
`IDF_TARGET` — and the factory board identity picks one of those. Panel initialization resolution remains
internal to the concrete driver. The board registry keeps separate private
logical display bounds only for configuration validation; they are not added
to the driver descriptor, device configuration, or control protocol.

Select drivers and immutable validation capabilities through the board registry
using the factory board identity chosen by the firmware build. A user
configuration must contain the same board identifier, but it does not select
or change the physical board. A mismatch is rejected.

Board-provided hardware and user-configured hardware are separate concerns.
The board registry declares immutable capabilities physically built into the
selected board. The sparse user configuration may additionally contain a
bounded list of supported hardware devices and their driver settings. That list
may be empty. Driver creation from this list remains configuration-driven and
is not limited to displays; the same boundary applies to buttons, encoders,
LEDs, touch controllers, and future peripherals.

For the current configurator contract, a display built into the selected board
is enabled by firmware by default. Its driver, transport, and pin assignments
are firmware-owned and are not user-editable. The configurator maps the board
identifier to a local immutable board profile and reports the known display
dimensions as a read-only capability. A later decision is required before
built-in display settings can become editable.

The configuration control protocol reports the immutable board identity but
does not transmit display dimensions. The display component remains the sole
owner of LVGL and panel initialization.

The display component adapts command-driven, RGB and MIPI-DSI panels to the
corresponding `esp_lvgl_port` registration path without knowing a concrete
board or controller.

## Consequences

- Board identity remains available when storage is empty, corrupt, or reset.
- The configurator resolves the correct display canvas from the `board` field
  in `INFO` and its local supported-board registry.
- Board pin assignments and controller initialization remain outside the
  firmware core.
- An empty user-configured hardware list does not disable hardware mapped by
  the board registry.
- The current configurator cannot disable, replace, or edit a board-provided
  display driver.
- Modules use the display component and do not depend on the selected driver.
- Supporting another board requires a firmware driver/board mapping and a
  matching configurator board profile.
- LVGL is owned by the display component and is not initialized by the hardware
  driver.
- All supported drivers may remain linked into one firmware image. Supported
  configurable devices may select drivers without changing the immutable board
  identity or overriding read-only board capabilities.
