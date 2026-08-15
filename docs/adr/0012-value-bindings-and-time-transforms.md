# ADR 0012: Value Bindings, Modifiers, and Time Transforms

Status: Accepted; the startup-only binding wording is superseded by ADR 0016,
which allows rebinding during a rebuild. The binding, modifier, and transform
boundaries remain in force.
## Context

Telemetry transports provide canonical typed values, while dashboard text
widgets need presentation strings. Formatting time inside SimHub makes the
transport own UI policy, and formatting inside the Lap Timer module would make
a reusable stateful module own presentation. A text widget also needs to apply
Lap Timer state before formatting its value.

## Decision

Keep stateful telemetry transformation in modules. Keep stateless,
presentation-independent value transforms in generic utilities so they can be
reused outside the dashboard.

A text widget has one bounded string `binding` to a canonical telemetry field.
Bindings are resolved and type-checked once during startup.

After binding, a bounded ordered `modifiers` list may apply stateful typed-value
processing. Modifiers preserve the value type. The initial `lap_timer` modifier
accepts `session.lap.current_time` as unsigned milliseconds and applies local
progression, correction, restart detection, and stale-telemetry timeout.
Presence of this modifier activates the Lap Timer module; there is no separate
root module declaration.

A text widget may select an optional transform. The initial `time` transform
supports:

- `duration_ms` renders an unsigned millisecond value as `MM:SS.mmm`;
- `signed_duration_ms` renders a signed millisecond value as `+S.mmm` or
  `-S.mmm`.

Without `transform`, a text widget preserves transport source text. Each time
transform accepts optional bounded `prefix` and `suffix` strings. It uses fixed
storage, performs no allocation, and rejects incompatible pipeline types during
configuration validation.

Implement the time transform as an independent ESP-IDF component under
`utils/transformers/time_transform`. It has no telemetry, dashboard, LVGL,
module, or service dependency.

Lap time presentation uses the reusable Text widget with the `lap_timer`
modifier and `time` transform. There is no parallel dedicated widget path.

This is an additive schema 2 extension: existing `binding` configurations stay
valid, while older firmware may reject configurations using `modifiers` or
`transform`.

## Consequences

- The Lap Timer module remains independent from LVGL and string presentation.
- Generic text widgets consume one pre-bound read callback and have no concrete
  Lap Timer dependency.
- Best and estimated lap telemetry can remain numeric milliseconds until the
  presentation boundary.
- Adding another modifier requires an explicit bounded pipeline adapter and
  configuration validation; the dashboard does not become a service locator.
- Time-transform behavior remains reusable outside dashboard code.
