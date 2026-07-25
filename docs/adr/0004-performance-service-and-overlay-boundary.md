# ADR 0004: Performance Service and Overlay Boundary

## Context

SimCore needs runtime diagnostics for CPU, rendering, display transfer, and memory
without coupling shared infrastructure to LVGL or a particular dashboard.

## Decision

Collect and aggregate runtime metrics in `services/performance`. The display
component forwards generic frame, render, and flush lifecycle events to the
service. The service does not depend on LVGL, the dashboard, modules, widgets,
or hardware drivers.

Render the latest immutable statistics snapshot in a platform dashboard widget
under `platform/dashboard/widgets/performance_overlay`. The performance service,
display instrumentation, and overlay are enabled together only when the
source-level `SIMCORE_DEBUG` feature define is set to `1`.

## Consequences

- Production builds compile the diagnostic objects but do not reference or link
  them into the firmware image.
- UI changes cannot alter how metrics are measured.
- The display component contains only the LVGL-to-service event adaptation.
- Debug-only integration points are removed by the preprocessor. Feature
  selection remains centralized in the source tree and does not depend on CMake
  command-line flags.
- Accurate per-core CPU load requires FreeRTOS runtime statistics.
