# ADR 0012: Value Bindings, Modifiers, and Value Transforms

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

A text widget may select an optional transform. The `time` transform supports:

- `duration_ms` renders an unsigned millisecond value as `MM:SS.mmm`;
- `signed_duration_ms` renders a signed millisecond value as `+S.mmm` or
  `-S.mmm`.

The `number` transform renders `value * scale + offset` with a fixed `decimals`
count. Unit conversion is expressed as scale and offset rather than as a table
of unit names, so the device never learns what a unit is and a new conversion
costs a configurator preset instead of a firmware release. It accepts every
numeric value type, and also a text source it can parse, because some sources
format their number on the PC; a source that does not parse is unavailable
rather than an error. Formatting is fixed point over integers: the newlib build
shipped with ESP-IDF offers no dependable float conversion, and rounding stays
exact only while the scaled magnitude fits the integer range of a double, which
is what bounds `decimals`.

Without `transform`, a text widget preserves transport source text.

Bounded `prefix` and `suffix` strings belong to the transform rather than to one
of its types, so an untransformed value can carry a unit as well. The
presentation boundary composes them around the transform output, and keeps the
value alone when the composed text would not fit.

Implement each transform as an independent ESP-IDF component under
`utils/transformers`, sharing the bounded text writer that lives beside them.
They have no telemetry, dashboard, LVGL, module, or service dependency, use
fixed storage, perform no allocation, and reject incompatible pipeline types
during configuration validation.

Lap time presentation uses the reusable Text widget with the `lap_timer`
modifier and `time` transform. There is no parallel dedicated widget path.

This is an additive schema 2 extension: existing `binding` configurations stay
valid, while older firmware may reject configurations using `modifiers` or
`transform`. Moving the affixes off the time transform left the payload
unchanged, because they keep the position they already had on the transform
object.

## Consequences

- The Lap Timer module remains independent from LVGL and string presentation.
- Generic text widgets consume one pre-bound read callback and have no concrete
  Lap Timer dependency.
- Best and estimated lap telemetry can remain numeric milliseconds until the
  presentation boundary.
- Adding another modifier requires an explicit bounded pipeline adapter and
  configuration validation; the dashboard does not become a service locator.
- Transform behavior remains reusable outside dashboard code.
- Transforms share one bounded writer, so the next transform starts at
  formatting instead of at buffer handling.
- Unit names live only in the configurator. A conversion the preset table does
  not list is still reachable by entering scale and offset directly.
