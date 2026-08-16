# ADR 0017: Conditional Widget Styling

Status: Accepted

## Context

Every colour a widget renders was fixed when it was built, so a dashboard could
not go red at the rev limiter, hide a readout that does not apply, or flash when
ABS engages. The Delta Time widget already does a hardcoded version of this: it
picks `faster`, `slower`, or `neutral` from module state and touches LVGL only
when the cached colour actually changed. What was missing was a way to author
that behaviour rather than compile it.

SimHub expresses this with an expression language on every property. An
interpreter contradicts the rule that periodic paths allocate nothing and look
nothing up by name, and ADR 0012 already chose bounded declarative transforms
over a formula engine for the same reason.

## Decision

A text widget carries one optional condition source and a bounded ordered list
of styling rules.

The condition source is a canonical binding with its own modifiers, independent
of the sources the widget displays. That independence is the point: a widget
showing `transmission.gear` turns red on `engine.rpm_percent`. It costs one
extra bound source per widget that uses rules, resolved by the same binder and
read through the same callback as any other source.

Its value is read as a number from any type — `uint32`, `int32`, `float32`,
`boolean` as 0 or 1, and a text source parsed the way the `number` transform
parses one, so a field that arrives pre-formatted from the PC can still drive a
rule.

**The first rule whose comparison holds describes the widget; whatever it does
not name stays as the widget was authored.** Rules do not accumulate, so one
pass decides the appearance. A rule may set the value colour, the background
colour, the border colour, visibility, and a blink period. Because the
transparent sentinel already means "unset" for a colour, a rule can change a
background but not clear one; a widget that needs that starts transparent and
lets a rule paint it.

No match is the authored style, and so is an unavailable or unparseable
condition value. A widget therefore cannot latch a colour that the telemetry has
left behind — pulling the cable returns the dashboard to how it was authored.

Evaluation lives in `platform/dashboard/conditions`, which depends on the
configuration contract and telemetry types but not on LVGL: it maps a telemetry
read to an optional number and resolves rules against a fallback style. The
widget owns everything LVGL, applying only the properties that differ from what
is on screen, and copies the rules into its own state for the reason it copies
transforms — a configuration replacement can swap the document out from under a
widget that did not itself change.

Blink is a period, not an animation system: the widget is shown and hidden on a
half period, the way the SimHub editor treats a control as one unit. Flashing
only the reading left the background steady beside a pulsing value, which reads
as parts changing at different moments rather than as one warning. Hiding and
the blink phase therefore feed a single visibility flag. The phase is anchored
to the moment the rule applies, so the frame that turns a widget red is one it
is visible in. A blinking widget keeps rendering the way a free-running source
does; a steady one still skips its render pass when nothing advanced.

A style change publishes one invalidated area covering the whole widget rather
than letting the border, the background and the value queue three. On a panel
that renders directly into the framebuffer it is scanning, separate areas can
reach the display on different frames, which is the same "one part at a time"
artifact seen from the other end.

A rule applies while it matches, which already means "flash for as long as
traction control is engaged". A rule may also carry a hold, and then the widget
keeps it for that long after the match ends. Without it a trigger shorter than
one blink period would be invisible, so the hold is what makes a momentary event
readable; a rule that keeps matching keeps restarting it. The latch lives in the
widget rather than in the resolver, which stays a pure function of the value and
the rules and reports only how long its match should survive.

A painted background may be inset from the border, so a widget that turns red
keeps its frame rather than flooding to the edge. LVGL fills a container to its
border, so an inset background is a child object sized to leave the frame clear
and the container paints nothing; a rule repaints whichever of the two the
widget was built with.

The Delta Time widget keeps its own tone model. Giving it rules as well would
leave two mechanisms deciding one colour.

This is an additive schema 4 extension: a widget without `conditions` parses,
validates, and renders exactly as before.

## Consequences

- Rev-limiter colour, warning colour, conditional hiding, and ABS/TC blinking
  are authored rather than compiled.
- A dashboard can react to telemetry it does not display, which is what makes a
  shift indicator possible on a gear readout.
- The configurator must send the watched field to SimHub as well, or a rule
  would never receive a value.
- Conditions cost storage per widget: the rules are copied into widget state,
  and the binder holds one more source per widget.
- A held rule outlives the telemetry that raised it, so the dashboard can show
  an event that lasted a few milliseconds. It also means a widget can be showing
  a state the car is no longer in, bounded by the hold.
- Gradients, rotation, opacity as a property, and animation curves remain out of
  scope. Adding an effect means another cached property and another comparison
  on every render.
- A second widget type that wants rules reuses the resolver; only the LVGL
  application is widget-specific.
