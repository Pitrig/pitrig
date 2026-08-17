# ADR 0021: Widget Groups and Slots

Status: Accepted; takes the extension ADR 0007 reserved and extends ADR 0014 one
level down. Introduced in schema 6.

## Context

ADR 0007 removed layout regions and made the display screen the only coordinate
space, and it closed with the condition under which that could be revisited:
shared visual grouping must be "an explicit widget or another future composition
primitive, not an implicit layout container". This is that primitive.

What forces it is the feature SimHub dashboards use constantly and SimCore cannot
express at all: an area of the screen whose contents change. Tyre temperatures in
a box that becomes fuel and energy in the same box; a pit block that appears over
the same rectangle the lap deltas were using. Today the only way to author that
is to overlap two sets of widgets and hide each one with its own copy of the same
condition, which is not authoring an area — it is repeating a rule per widget and
hoping the geometry agrees.

Multiple screens (ADR 0020) solve the whole-display version of this and are the
wrong tool for a corner of one. Swapping the screen to change a quarter of it
throws away the three quarters that did not change.

## Decision

A screen may hold a bounded list of **groups**. A group is an explicit
composition primitive with an identifier and its own box in absolute screen
pixels, and widgets are authored inside it.

A widget inside a group is placed relative to the group's box. This is the part
that changes a rule from ADR 0007, and it is worth being exact about what it does
not change. A group performs no layout: it does not flow, stack, anchor, align,
or size its children, and there is no profile expansion or inherited geometry
anywhere. A group is a rectangle, and a widget in it has literal coordinates
inside that rectangle. What ADR 0007 refused was a hidden second coordinate
system that a sparse document could not explain on its own; a group states its
box and its children state their offsets, and the document remains readable
without a profile.

The wire format follows the shape that already exists one level up. Widgets are
authored inside the group's `widgets` array exactly as they are authored inside a
screen's, and the parser fans them into the same dashboard pool while stamping a
`group_index` beside the `screen_index` it already stamps. Nothing references a
group by name, no lookup happens at runtime, and the pool, the per-type caps, and
the screen's reference table are all unchanged. A widget belongs to exactly one
group for the same reason it belongs to exactly one screen: an LVGL object has
one parent.

In firmware a group is one LVGL container parented to its screen. Relative
coordinates and clipping to the box then come from LVGL itself rather than from
arithmetic in the composition, and geometry resolution keeps its existing shape —
it resolves a parent from the widget's own indices instead of resolving one and
then correcting it.

### Slots

A group may name a **slot**. Groups sharing a slot occupy the same box and only
one of them is visible at a time. Validation enforces that they agree on
geometry, because a slot whose groups disagree is not an area — it is two areas
that happen to overlap, which is the thing this decision exists to replace. One
group per slot is marked as the one shown before anything has selected another.

Two things select the visible group, and they are the two the dashboard already
has: telemetry, and a finger.

Telemetry selection reuses conditional styling wholesale. A group carries the
same optional condition source and the same bounded ordered rule list a widget
carries, evaluated by the same LVGL-free resolver, and the first rule that
matches selects that group. A rule's hold applies here too, so a momentary event
such as a traction-control intervention can hold its group up long enough to be
read.

Touch selection is a tap anywhere on the slot, which advances to the next group
in it. This costs no change to any widget: every widget already removes its
clickable flag, and a child that does not take a click lets it reach the parent,
so the group container is the only object in the dashboard that accepts input.

Where they disagree, telemetry wins, and the way it wins is the model ADR 0017
already established. While any group in the slot matches a rule, that group is
shown. When none matches, the slot falls back to whatever the driver last
selected, or to the default group if nothing has been tapped. So a dashboard
cannot latch into a state its telemetry has left behind, and pulling the cable
returns the slot to what the author chose — and a tap can still park a slot on
the block the driver wants while nothing more urgent is happening.

Bounds are eight groups and four slots for the whole dashboard. Grouping does not
change the widget budget; the same widgets are simply parented differently.

This is additive. A document with no groups parses, validates, composes, and
renders exactly as it did in schema 5.

### Out of scope

Nested groups, a widget in more than one group, a group spanning screens, and
animated slot transitions are all deliberately excluded. Each would either
introduce the unbounded scene graph ADR 0007 refused or a second parent, and none
of them is needed to author an area whose contents change.

## Consequences

- An area of a screen can change its contents from telemetry or from a tap,
  authored once on the area instead of repeated per widget.
- Widget geometry is relative to a group when a widget is in one and absolute
  otherwise. The configurator must convert on grouping and ungrouping, and the
  two coordinate spaces are distinguishable only by whether a widget is inside a
  group in the document.
- A group is one object in its screen's stacking order, and its children stack
  within it. A widget in a group cannot be raised above a widget outside it
  without raising the whole group.
- Children are clipped to the group's box. A widget authored larger than the
  group it is in is cut off rather than validated into place.
- A widget in a group that is not the visible one is not rendered at all, so its
  own conditional rules cannot show it.
- The condition source of every group must be sent to SimHub like a widget's, or
  its rules never receive a value.
- Slot geometry is enforced, not inferred: editing the box of one group in a slot
  is editing the box of all of them.
- Both selection mechanisms are optional. A group with no slot is simply a
  container that moves as one in the editor and clips its children.
- A dashboard with groups is not backwards compatible with schema 5 firmware,
  which is what the version bump records.
