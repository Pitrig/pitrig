# ADR 0003: Lap Timer Module and Dashboard Widget Boundary

## Context

The lap timer must continue smoothly between irregular telemetry updates while also being rendered by the LVGL dashboard. Timing behavior must remain reusable and independent of the selected display, dashboard implementation, and future communication protocol.

## Decision

Keep lap-time state, monotonic-clock extrapolation, and telemetry error correction in the `modules/lap_timer` module.

Keep the LVGL label, time formatting, font, colors, and 16 ms render timer in a dashboard widget under `platform/dashboard/widgets/lap_timer`.

The module subscribes to telemetry update notifications and reads the latest
immutable telemetry snapshot. Telemetry ingestion does not call the module
directly.

## Consequences

- The Lap Timer module has no LVGL, display-driver, dashboard, USB, or protocol dependency.
- Dashboard rendering can change without changing timing behavior.
- Communication and protocol implementations can change without changing the module or widget APIs.
- The core composes the telemetry services and module subscriptions during startup.
- LVGL resources remain owned by platform-specific dashboard code.
