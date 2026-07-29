# ADR 0007: Dashboard Layout Regions

## Context

Dashboard widgets need configurable position and size, and multiple widgets may
share a visually grouped area. Creating the same parent block independently
inside every widget duplicates LVGL objects and makes shared layout ambiguous.
Widgets must also remain usable without an additional container.

## Decision

Keep the display screen as the default dashboard coordinate space. Define
optional, centrally configured layout regions with bounds, padding, background,
border, and corner radius. Widgets select a region by identifier or use the
screen identifier by default.

Resolve each widget's anchor, offset, and optional explicit size against the
selected region's content bounds. Region border and padding reduce those content
bounds. Create one shared LVGL panel for each region before creating widgets and
parent its widgets to that panel. Invisible regions use a transparent panel so
their bounds still clip child rendering.

Keep Lap Timer and Delta Time as dedicated widgets. Represent all direct
telemetry labels with one reusable text-widget implementation and a bounded
ordered configuration array. Each text instance independently selects a
telemetry binding, placement, padding, border, optional border-breaking title,
value style, and background. All text instances share one render timer and one
collection.

Persist each telemetry binding as a bounded canonical field name. During
dashboard startup, a widget binder resolves every name through the telemetry
registry and validates it before LVGL objects are created. Runtime widget state
stores only the resulting handle. Each refresh reads the required state slots
directly; it does not search the registry or copy the complete telemetry state.

## Consequences

- Multiple widgets can share one configured and clipping parent.
- Widgets without a region are positioned relative to the screen.
- Decorative panels and logical grouping use the same layout concept.
- Widget implementations receive resolved geometry and do not own region
  lookup, padding, or border calculations.
- Every configured region owns one LVGL object, including invisible regions.
- Layout lookup and validation happen during initialization; widget update paths
  do not allocate or perform region searches.
- Adding another telemetry label requires configuration rather than another
  widget implementation.
- Multiple instances of the same binding do not require duplicated runtime
  logic or timers.
- Invalid or unknown bindings fail during dashboard startup.
