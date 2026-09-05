# ADR 0004: Performance Service and Overlay Boundary

Status: Accepted. Amended by
[ADR 0028](0028-debug-build-and-debug-application-boundary.md): the service,
the overlays and the collector now live in `firmware/debug/`, which a production
build registers as empty components, and the boundary this ADR draws is a build
boundary as well as a dependency one. Also amended by
[ADR 0027](0027-partial-render-buffers-and-unsynchronized-scan-out.md): what a
debug build draws over the dashboard is now the `PITRIG_DEBUG_OVERLAY` Kconfig
choice — the full panel this ADR describes, an FPS-only chip that LVGL can draw
without touching the widgets beneath it, or nothing. The service/overlay
boundary is unchanged and both views stay behind it.

## Context

Pitrig needs runtime diagnostics for CPU, rendering, display transfer, and memory
without coupling shared infrastructure to LVGL or a particular dashboard.

## Decision

Collect and aggregate runtime metrics in `services/performance`. The display
component forwards generic frame, render, and flush lifecycle events to the
service. The service does not depend on LVGL, the dashboard, modules, widgets,
or hardware drivers.

Render the latest immutable statistics snapshot in a platform dashboard widget
under `platform/dashboard/widgets/performance_overlay`. The performance service,
display instrumentation, and overlay are enabled together only when the
compile-time `CONFIG_PITRIG_DEBUG` Kconfig option is enabled. Production and
debug IDE tasks select this option through checked-in defaults profiles.

The dashboard composition owns the overlay view instance, including its LVGL
label, timer, transport observer, and rate-counter state. The overlay does not
use namespace-global presentation state.

The collector is the single debug-only process-wide instrumentation sink.
Rendering, transport, and control callbacks publish measurements through its
small namespace API so production objects do not acquire a performance-service
dependency in their constructors. This exception contains metrics only; module,
configuration, transport, and presentation state remain instance-owned.

## Consequences

- Production builds compile the diagnostic objects but do not reference or link
  them into the firmware image.
- UI changes cannot alter how metrics are measured.
- The display component contains only the LVGL-to-service event adaptation.
- Debug-only integration points are removed by the preprocessor. Feature
  selection remains centralized in checked-in Kconfig defaults and does not
  require editing source headers or passing ad-hoc CMake definitions.
- Accurate per-core CPU load requires FreeRTOS runtime statistics.
