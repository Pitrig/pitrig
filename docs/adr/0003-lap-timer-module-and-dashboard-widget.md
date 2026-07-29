# ADR 0003: Lap Timer Module and Dashboard Widget Boundary

## Context

The lap timer must support both smooth local progression between irregular
telemetry updates and a telemetry-only mode. Local progression must stop when
telemetry becomes stale instead of running indefinitely. Timing behavior must
remain reusable and independent of the selected display, dashboard
implementation, and future communication protocol.

## Decision

Keep lap-time state, monotonic-clock extrapolation, telemetry error correction,
and stale-telemetry handling in the `modules/lap_timer` module.

Configure the module with:

- `telemetry_only`, which displays only the latest received telemetry value
  without local extrapolation;
- `telemetry_timeout_ms`, which limits local extrapolation when
  `telemetry_only` is disabled.

When telemetry resumes after the timeout, synchronize from the received value
without adding the stale interval to the displayed lap time.

Keep the LVGL label, time formatting, font, colors, and 16 ms render timer in a dashboard widget under `platform/dashboard/widgets/lap_timer`.

At startup, composition resolves the canonical current-lap field through the
telemetry registry and passes its typed handle to the module. The module
subscribes to telemetry update notifications and reads only that handle from
the telemetry state. Telemetry ingestion does not call the module directly.

## Consequences

- The Lap Timer module has no LVGL, display-driver, dashboard, USB, or protocol dependency.
- Dashboard rendering can change without changing timing behavior.
- Communication and protocol implementations can change without changing the module or widget APIs.
- Devices can select telemetry-only or bounded-extrapolation behavior through
  configuration.
- A telemetry outage cannot make the locally extrapolated timer run
  indefinitely.
- The core composes the telemetry services and module subscriptions during startup.
- Protocol identifiers and field names do not enter the module.
- LVGL resources remain owned by platform-specific dashboard code.
