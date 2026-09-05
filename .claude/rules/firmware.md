---
paths:
  - "firmware/**"
---

# Firmware guidance

Layers are strict and one-directional; this is the constraint most changes must
respect:

```text
main → core → { components, services, platform composition }
platform composition → modules / components / services
components → interfaces ← drivers
```

- `core/` contains no hardware-specific and no feature-specific code and reaches
  no LVGL header: the dashboard is opaque to it through
  `dashboard_composition::instance()`, so a widget type change does not
  recompile it.
- `components/` depend on interfaces, never on a concrete driver and never on a
  service; `led` knows nothing of the configuration contract and the `rgb_leds`
  module translates for it.
- `modules/` must not depend on platform code or LVGL and must not touch
  hardware directly. A module may depend on a service — `value_conditions` is a
  service for exactly that (ADR 0030). `rgb_leds` repaints on its own 60 Hz
  task because the event-bus handler runs on the transport read task, and
  blocking it stalls telemetry for the dashboard as well.
- `services/` know no LVGL and no board. `asset_control` is the `SCF1` upload
  engine; `font_asset_control`, `image_asset_control` and `firmware_update` are
  thin per-kind wrappers over it.
- `platform/dashboard/memory` puts **every** LVGL allocation in external RAM
  (ADR 0026).
- `utils/pitrig_config` is the Kconfig surface and the `PITRIG_*` aliases. It
  lives under `utils/` because every layer reads it; under `components/` it gave
  drivers and services a dependency on a component.
- `debug/` exists only to observe the product. Each of its components registers
  empty `SRCS` and `INCLUDE_DIRS` unless `CONFIG_PITRIG_DEBUG`, so a production
  build compiles none of it and cannot compile an unguarded
  `#include "performance.hpp"` either. Requirements on these components stay
  **unconditional**: ESP-IDF resolves requirements in an early pass where
  `CONFIG_*` is not yet known, so the component turns itself off rather than its
  callers. Production code keeps only one-line `#if PITRIG_DEBUG` hooks, and
  `python3 tools/check_debug_isolation.py --check` fails when their number
  changes. A debug build is the product plus observation and must never change
  product behaviour (ADR 0028).

Every layer directory is a separate ESP-IDF component. All of them except
`components/` are registered in `EXTRA_COMPONENT_DIRS` in
`firmware/CMakeLists.txt` — **adding a new service, module or driver means adding
its path there**, and the P4-vs-S3 branch for board drivers. `components/` is
ESP-IDF's default search path. Public headers live in `include/`, sources in
`src/`. Extension order: a module first, reuse components and services, a
component only for a new hardware capability, a driver only for new hardware;
the core should rarely change.

## Touching startup

The phases are `boot guard → configuration → link + control protocol → display
→ assets → modules + dashboard → composed → complete`, and the order is the
decision (ADR 0025; `docs/architecture.md` has the why). Consequences to
respect:

- `mark_running_image_valid()` fires as soon as the link is up, so rollback
  catches only an image that cannot be talked to.
- `display::initialize()` returns `nullptr` instead of aborting.
- A `SET`/`APPLY`/`RESET` arriving before composition waits on an event bit and
  is answered `busy` after ten seconds; reads and `REBOOT` never wait.
- `binary_session::Claim` stays closed until composition, so an upload cannot
  erase a partition startup is still copying out of — `BEGIN`/`CLEAR` answer
  `busy` and do not wait.
- Log silencing happens at the end of startup, not when the link starts.
- The task watchdog (`CONFIG_ESP_TASK_WDT_PANIC`, 10 s, idle checks off)
  watches only tasks that feed it: each link's read task and the render
  trigger, whose LVGL-lock probe is what catches a wedged LVGL task.
- The boot-failure count is cleared ten seconds after startup ends, not when it
  ends, or a fault just after composition would reset it every time and never
  reach the threshold.

## Boards

The DevKitC-1 has **no display**: `BoardDefinition::display` and
`BoardDefinition::input` are null, a `dashboard` section on it is rejected rather than ignored, and its only
output is the addressable lamp `BoardDefinition::status_led` names. That lamp
moved between board revisions, so its pin is a Kconfig choice
(`PITRIG_STATUS_LED_GPIO38` / `_GPIO48`). Each board has exactly one link;
`transport/usb_cdc` owns the whole native USB device — a composite CDC serial
port and an HID gamepad, selected by `CONFIG_TINYUSB_HID_COUNT`. `led/ws2812_rmt`
drives one RMT channel per output, which is why four outputs is the ceiling on
both chips.

## Vendored patches

The `esp_lvgl_port` patches are a **stack**: nine files under
`firmware/patches/`, one concern each, applied in the order
`cmake/apply_esp_lvgl_port_dsi_patch.cmake` lists them. `cmake/apply_patch_stack.cmake`
checks the whole stack — forward, else reverse — in a temporary git index, and
a vendored tree matching neither end fails configure. `managed_components/` is
gitignored, so an edit to the vendored source is written back into the layer it
belongs to, with no comments, before the next configure. A clean checkout needs
`reconfigure` twice before `build`, because the first configure records the
unpatched port's requirements and the P4 build then fails on `esp_cache.h`.
The stack is applied for **every** target, not only the P4, because the
`dsi-full-strips` patch is what declares `full_strips`, and `components/display`
sets that flag on every board. Keep S3 and P4 builds sequential: an S3
configure re-resolves `managed_components` and removes the P4-only components
from under a running P4 configure.

## Conventions

Static allocation, `constexpr`, bounded fixed-size structures; no heap churn in
periodic paths, no blocking work outside dedicated FreeRTOS tasks, no global
mutable state. There is no central application scheduler: FreeRTOS tasks for
blocking work, LVGL timers for rendering, event-bus callbacks for short module
updates. Two things that look like comments are not: the `# CONFIG_X is not set`
lines in `sdkconfig.defaults*` are kconfiglib directives, and the SPDX header on
the vendored `drivers/guition_jc1060p470c/src/panel.c` is attribution.
