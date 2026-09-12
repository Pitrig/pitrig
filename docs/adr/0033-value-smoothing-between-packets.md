# ADR 0033: Value Smoothing Between Telemetry Packets

Status: Accepted. Adds a second stateful stage to the value pipeline of
[ADR 0012](0012-value-bindings-and-time-transforms.md), as a service rather
than a module, and leaves the lap timer of
[ADR 0003](0003-lap-timer-module-and-value-pipeline.md) as it is.

## Context

Telemetry arrives at the rate the host sends it: 60 Hz for the `fast` fields at
best, 20 Hz for `normal`, and 10 Hz for every field under SimHub Free. A widget
redraws when its field commits, so a bar fed at 20 Hz moves in twenty steps a
second on a panel that could show sixty, and between packets nothing moves.
Smooth motion at a feed slower than the panel cannot also be free of delay: a
value drawn between two packets is either behind the newer one or a guess about
the next. The lap timer already resolves this for one field by extrapolating on
a local clock and folding the correction in over time; every other value
stepped.

## Decision

A `value_smoothing` service holds one follower per field of the telemetry
catalog, indexed by handle, so every widget on the same field shares one and a
binding cannot run out of them. It subscribes to the telemetry update event and,
on the transport task, records only the sample, its arrival time and a per-field
period estimate; the widget timers read the follower through the same read
callback a modifier uses, over a seqlock, and a followed widget is free-running
as a lap-timer source is. A read before the first sample falls through to the
raw value.

The policy is one dashboard-wide setting, `dashboard.smoothing`, because it is a
property of the feed rather than of a widget and the driver judges it by eye:
`off`; `interpolate`, which arrives at the packet just received when the next is
due, one period behind and never past it; and `predict`, which continues at the
rate the last two packets showed, at most one period beyond the last, and blends
the error the next packet reveals over the period that follows. The period is
the field's own inter-arrival time, blended quickly downward and slowly upward
so a repeated packet does not stretch it, and a gap over 250 ms is a jump drawn
at once. Changing the setting rebinds every widget, so a live apply that
changes it takes the full rebuild path.

Eligibility is the consumer's decision: bars, arcs, needles, graph traces and
text sources with a `number` transform follow; conditions, colour ramps,
captions, slot triggers, indicators and modified sources read the packet
itself, and booleans never follow. The LED module does not follow either — its
effects read the raw state, and joining them is a separate decision.

## Consequences

- Motion at a sub-panel feed is continuous, at the price the policy states:
  one period of delay, or a bounded overshoot on reversals.
- A followed widget redraws every frame while its value moves, so smoothing
  spends the frame budget of `runtime-performance.md` on the followed widgets
  whether the feed is 20 Hz or 60.
- The 228 followers cost about 14 KB, placed in external RAM by the core the
  way font faces and images are, because on the ESP32-P4 that much internal RAM
  is the difference between the LVGL render strips fitting and the display not
  coming up. Nothing runs while the option is off.
- Widgets, modules and the transport keep their shape: the follower is reached
  through the existing read callback, and the transport task does one bounded
  update per armed field.
- Text without a transform, and the source-formatted fields shown verbatim, keep
  the host's string and cannot glide.
