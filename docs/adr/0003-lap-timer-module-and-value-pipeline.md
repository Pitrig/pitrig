# ADR 0003: Lap Timer Module and Value-Pipeline Boundary

Status: Accepted; the prohibition on a dedicated Lap Timer widget is
superseded by ADR 0015, which makes widget types descriptor-driven. The
value-pipeline boundary remains in force.
## Context

The lap timer must support smooth local progression between irregular telemetry
updates. Local progression must stop when telemetry becomes stale instead of
running indefinitely. Timing behavior must remain reusable and independent of
the selected display, dashboard implementation, and future communication
protocol.

## Decision

Keep lap-time state, monotonic-clock extrapolation, telemetry error correction,
and stale-telemetry handling in the `modules/lap_timer` module.

Use a fixed one-second stale-telemetry timeout. Activate the module when a
`lap_timer` value modifier is present; do not expose a separate root Lap Timer
configuration section or a dedicated Lap Timer widget.

When telemetry resumes after the timeout, synchronize from the received value
without adding the stale interval to the displayed lap time.

Keep LVGL labels, fonts, colors, and render timers in the reusable Text widget.
Keep stateless millisecond formatting in the shared time-transform utility
defined by ADR 0012.

At startup, composition resolves the modifier's canonical current-lap binding
through the telemetry registry and passes its typed handle to the module. The
module subscribes to telemetry update notifications and reads only that handle
from the telemetry state. Telemetry ingestion does not call the module directly.

## Consequences

- The Lap Timer module has no LVGL, display-driver, dashboard, USB, or protocol
  dependency.
- Dashboard rendering can change without changing timing behavior.
- Communication and protocol implementations can change without changing the
  module or value-pipeline APIs.
- A telemetry outage cannot make the locally extrapolated timer run
  indefinitely.
- The core composes the telemetry services and module subscriptions during
  startup.
- Protocol identifiers and field names do not enter the module.
- LVGL resources remain owned by the reusable platform Text widget.
- Generic Text widgets receive the modified value through a pre-bound callback
  and have no dependency on the concrete Lap Timer type.
