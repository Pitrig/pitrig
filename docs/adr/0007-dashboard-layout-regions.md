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

## Consequences

- Multiple widgets can share one configured and clipping parent.
- Widgets without a region are positioned relative to the screen.
- Decorative panels and logical grouping use the same layout concept.
- Widget implementations receive resolved geometry and do not own region
  lookup, padding, or border calculations.
- Every configured region owns one LVGL object, including invisible regions.
- Layout lookup and validation happen during initialization; widget update paths
  do not allocate or perform region searches.
