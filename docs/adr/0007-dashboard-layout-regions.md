# ADR 0007: Dashboard Layout Regions

Status: Accepted; supersedes the original region-based decision. The
single-coordinate-space rule is superseded by ADR 0014 and the fixed widget-type
list by ADR 0015. The explicit composition primitive reserved here for shared
visual grouping is taken up by ADR 0021, which makes geometry relative inside a
group; absolute placement outside one, and z_index ordering, remain in force.

## Context

The original dashboard model introduced shared layout regions, anchors, and
offsets so several widgets could be positioned relative to a common LVGL
parent. That model predates the desktop configurator.

The configurator uses a direct-manipulation display canvas. Persisting both
region-relative placement and editor geometry creates two competing coordinate
systems, requires hidden profile expansion, and prevents a configuration from
being sparse and self-explanatory.

## Decision

Remove dashboard regions from the persisted configuration and runtime
composition. Do not persist region identifiers, anchors, or anchor-relative
offsets.

Every configured widget uses absolute `x`, `y`, `width`, and `height` values in
the logical display coordinate space reported by the immutable board
descriptor. The display screen is the only configuration coordinate space.
The dashboard may additionally define one opaque `background_color`; when it
is absent the screen remains black.

Each widget may define a signed 16-bit `z_index`; larger values render above
smaller values. The default is zero. Equal values retain stable configuration
order: the dedicated Delta Time widget first, followed by Text widgets in
array order. The configurator preview uses the same ordering rule as LVGL.

Keep Delta Time as a dedicated widget because it renders module-specific scale
state. Represent Lap Timer and direct telemetry labels with the bounded reusable
text-widget type. Widget presence in the sparse configuration controls whether
a widget is created.

Value bindings remain bounded canonical telemetry fields. A startup-only binder
resolves and type-checks bindings and modifier pipelines before LVGL objects are
created; periodic update paths keep using only bound read callbacks.

## Consequences

- The configurator and firmware use one coordinate system.
- Selecting empty canvas space edits the dashboard screen background rather
  than a second synthetic layout object.
- Overlapping widgets have deterministic ordering without introducing nested
  layout containers or an unbounded scene graph.
- An empty widget collection produces an empty display.
- Runtime composition no longer creates region panels or performs region
  lookup, clipping, padding, or anchor resolution.
- Shared visual grouping must be represented by an explicit widget or another
  future composition primitive, not by an implicit layout container.
- Existing schema 0 configurations are not compatible because their geometry
  depends on regions and anchors.
- Invalid bounds or telemetry bindings still fail validation before widget
  creation.
