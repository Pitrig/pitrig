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

A text widget has a bounded ordered list of `sources`, each with one bounded
string `binding` to a canonical telemetry field, its own modifiers, and its own
transform. The widget renders every source in order and concatenates the result
into one string. Bindings are resolved and type-checked once during startup.

Composition needs no template language and no format-string parsing, because the
transform affixes already supply the literal text: `P 3/24` is a position source
with the prefix `P ` followed by a participants source with the prefix `/`. A
separator therefore inherits the type checking and the byte bounds that already
apply to an affix.

A source that has no value contributes the zero its own transform renders, so a
live source keeps updating next to a silent one. The widget-level
`unavailable_text` is shown only while no source has a value at all, and only
once telemetry has started: before the first line the widget shows the zeros,
so a board still waiting for its feed does not read as a list of missing values.

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

The ordered `sources` array replaced a widget-level `binding`, `modifiers` and
`transform`, and firmware carries no second spelling of it. The configurator
migrates a document authored against an older schema when it loads it, so the
one-time cost is a device rejecting its stored record and booting the factory
dashboard until the next upload, not a configuration anyone rewrites by hand.

## Amendment: presentation history

A widget may keep a bounded history of the values it has read, for its own
drawing only. The graph widget does: it samples its sources on its own timer
into fixed ring buffers and draws the result as traces.

This does not make the widget a stateful modifier. A modifier produces a value
the pipeline hands to whoever asked for it, which is why `lap_timer` is module
code behind a callback. A trace is geometry: nothing else can read it, it is
never published, it is discarded when the widget is destroyed, and it changes
with the passage of time rather than with the value. Routing it through a module
would give the pipeline a consumer-specific shape for no gain.

The bound is the point. History is a fixed array sized by `kMaximumGraphPoints`,
allocated with the widget, so a trace cannot grow and the sample rate cannot
outrun its storage.

Amended in schema 13: a graph draws up to `kMaximumGraphSources` of them over
one plot. Each trace is a source, a window and a colour, and each owns a history
of its own — so the bound is now a product, which is why the source cap is the
smallest of the three multi-source caps. What stays shared is the time axis: one
`point_count` and one `sample_interval_ms` for the widget, sampled in one pass,
because traces taken on separate clocks would not line up along it.

The widget's own `source` is the first trace and `traces` holds the rest, rather
than an array replacing both. That is the opposite of what the text widget did,
and deliberately so: a gauge's `source`, `minimum` and `maximum`
are the shape every value widget binds through, and a graph that spelled them
differently would be the one exception to it. The cost is that the array holds
one fewer entry than the widget draws, which is why `kMaximumGraphTraces` is
stated beside `kMaximumGraphSources` instead of being derived at each reader.

## Consequences

- The Lap Timer module remains independent from LVGL and string presentation.
- A widget may retain bounded presentation history sampled on its own timer; it
  is not a telemetry value and does not enter the pipeline.
- A widget may bind several sources without an array replacing the single-source
  spelling, when that spelling is what its family shares.
- Generic text widgets consume pre-bound read callbacks and have no concrete
  Lap Timer dependency.
- One widget can align parts that separate widgets could not: a value label is
  sized to its own text, so `3` and `24` in neighbouring widgets move their
  separator as the digits change width.
- Composition costs storage per widget rather than per dashboard, in the
  document, the widget render state, and the binder. `kMaximumTextSources` is
  the RAM budget decision.
- Best and estimated lap telemetry can remain numeric milliseconds until the
  presentation boundary.
- Adding another modifier requires an explicit bounded pipeline adapter and
  configuration validation; the dashboard does not become a service locator.
  Which module answers a modifier is a table indexed by `ValueModifierType`,
  filled once at the dashboard composition root beside the widget-type
  descriptors. The binders, the slots controller and every widget type resolve a
  modifier by its index, so they name no module and a second one does not reach
  them. An entry left empty — its module did not start — fails the bind rather
  than silently reading the telemetry the modifier was meant to replace.
- Transform behavior remains reusable outside dashboard code.
- Transforms share one bounded writer, so the next transform starts at
  formatting instead of at buffer handling.
- Unit names live only in the configurator. A conversion the preset table does
  not list is still reachable by entering scale and offset directly.
