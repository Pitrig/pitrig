# ADR 0021: Nested Shape Containers and Slots

Status: Accepted; takes the extension ADR 0007 reserved and extends ADR 0014 one
level down. Introduced in schema 6 as a separate `group` primitive; replaced in
schema 9 by the shape widget, which now holds widgets and no longer clips them.

## Superseded decisions

Schema 6 through 8 had `screen.groups`: a list of `GroupConfiguration` records,
each an invisible rectangle with an id, a box, a slot and its own `widgets`
array, and a `group_index` on every widget beside its `screen_index`. Everything
that record did is now done by the shape widget, and `screen.groups` is gone.
Two decisions from that version are reversed outright and recorded below:
children were clipped to the container, and nesting was out of scope.

## Context

ADR 0007 removed layout regions and made the display screen the only coordinate
space, and it closed with the condition under which that could be revisited:
shared visual grouping must be "an explicit widget or another future composition
primitive, not an implicit layout container". This is that primitive.

What forces it is the feature SimHub dashboards use constantly and SimCore cannot
express at all: an area of the screen whose contents change. Tyre temperatures in
a box that becomes fuel and energy in the same box; a pit block that appears over
the same rectangle the lap deltas were using. Without it the only way to author
that is to overlap two sets of widgets and hide each one with its own copy of the
same condition, which is not authoring an area — it is repeating a rule per
widget and hoping the geometry agrees.

Multiple screens (ADR 0020) solve the whole-display version of this and are the
wrong tool for a corner of one. Swapping the screen to change a quarter of it
throws away the three quarters that did not change.

Two things about the first version of this ADR turned out to be wrong in use.
A group painted nothing, so every area that needed a visible plate had a shape
widget dropped inside it whose only job was to be the box the group already
was — one concept authored as two. And the clip, taken for free from LVGL, cut
things the author meant to see: a caption straddles its widget's top border by
design, so a captioned widget at the top of a group lost the top half of its
label, and a widget nudged past the container's edge disappeared instead of
overhanging it.

## Decision

The **shape widget is the container**. A shape may hold a bounded `widgets`
array, and any widget type may appear in it — including another shape, so
containers nest to a bounded depth. There is no separate group primitive: a
container is a widget first, which is what makes it draw, carry a frame, take a
tap, stack among its siblings, and cost one shape pool slot.

A widget inside a container is placed relative to that container's box. This is
the part that changes a rule from ADR 0007, and it is worth being exact about
what it does not change. A container performs no layout: it does not flow,
stack, anchor, align, or size its children, and there is no profile expansion or
inherited geometry anywhere. It is a rectangle, and a widget in it has literal
coordinates inside that rectangle. What ADR 0007 refused was a hidden second
coordinate system that a sparse document could not explain on its own; a
container states its box and its children state their offsets, and the document
remains readable without a profile.

The wire format follows the shape that already exists one level up. Widgets are
authored inside the container's `widgets` array exactly as they are inside a
screen's, and the parser fans them into the same dashboard pool while stamping a
`parent_index` beside the `screen_index` it already stamps. `parent_index`
addresses the **shape pool**, so a parent is named by the same index its own
widget uses; nothing references a container by name and no lookup happens at
runtime. A widget belongs to exactly one container for the same reason it
belongs to exactly one screen: an LVGL object has one parent.

Depth is bounded, and the bound is real: the parser recurses once per level, so
`kMaximumNestingDepth` is what limits the configuration task's stack rather than
an authoring preference. Cycles are unrepresentable rather than merely rejected
— a depth-first parse counts a container before its children, so a nested shape's
own pool index is always higher than its parent's, and validation asserts that.

### Children are drawn where they land

A container does not clip its children. LVGL clips to a parent's box by default,
so this is a decision that costs code: each container carries
`LV_OBJ_FLAG_OVERFLOW_VISIBLE` and an extra draw size, which widens drawing,
hit-testing and invalidation together.

That extra draw size is **measured**, not maximal. `lv_obj_invalidate` grows the
invalidated area by it, so a container declaring a display-sized overflow would
repaint the whole screen every time a styling rule repaints that container — at
blink rate, a frame-budget regression on the S3. Composition therefore measures
what each container's children actually reach, walking the pool backwards so a
nested container's own figure is final before the container above folds it in.

The one bound left on geometry is the display. A box is refused only when it is
entirely outside it, because the display is the only edge with no pixels beyond
it. Everything else — a caption overhanging a border, a readout hanging past the
panel it belongs to, a negative relative coordinate — is authoring, not error.

### Slots

A container may name a **slot**. Shapes sharing a slot occupy the same box and
only one of them is visible at a time. Validation enforces that they agree on
geometry *and on parent*, because coordinates under different containers are in
different spaces, so "the same box" would not mean the same pixels. One shape per
slot is marked as the one shown before anything has selected another.

Two things select the visible shape, and they are the two the dashboard already
has: telemetry, and a finger.

Telemetry selection reuses conditional styling wholesale — the same operators,
the same bounded ordered rule list, the same LVGL-free resolver, and the same
hold. What it does not reuse is the frame's `condition_source` and `conditions`:
a container carries a separate `slot_source` and `slot_conditions`. Selection and
appearance are different questions and in practice watch different fields — "show
the pit block when the limiter is on" versus "flash this panel when fuel is low"
— and sharing one array would make every styling rule silently win its slot as
well. It would also make `hidden` incoherent, with the painter and the slot
controller writing the same LVGL flag every refresh; a hiding rule on a slot
member is refused for that reason.

Touch selection is a tap anywhere on the slot, which advances to the next shape
in it. This costs no change to any widget: every widget removes its clickable
flag as it builds, slots are attached afterwards and put the flag back on the
containers they cycle, and a child that does not take a click lets it reach the
parent. Nested slots need nothing either — LVGL hit-tests children first, so the
innermost slot takes the tap and the outer one never sees it.

Where they disagree, telemetry wins, and the way it wins is the model ADR 0017
already established. While any member matches a rule, that member is shown. When
none matches, the slot falls back to whatever the driver last selected, or to the
default before anything has been tapped. So a dashboard cannot latch into a state
its telemetry has left behind, and pulling the cable returns the slot to what the
author chose — and a tap can still park a slot on the block the driver wants
while nothing more urgent is happening.

### Out of scope

A widget in more than one container, a container spanning screens, animated slot
transitions, and layout of any kind stay out. Each would either introduce the
unbounded scene graph ADR 0007 refused or a second parent. Nesting, which the
first version of this ADR excluded, is now in.

## Consequences

- An area of a screen can change its contents from telemetry or from a tap,
  authored once on the area instead of repeated per widget — and that area is a
  widget, so it can also be seen.
- One concept instead of two. A container that needs a visible plate is the
  plate; the shape-inside-a-group workaround is gone, and so is the group's own
  copy of id, box, stacking and action.
- Children are **not** clipped. A caption overhangs its container the way it
  overhangs its widget, and a widget may sit partly outside the box it belongs
  to. Only the display still bounds anything.
- Hit-testing extends with the drawn overflow, so a container's tap area grows by
  the same amount its children reach.
- Widget geometry is relative to its container and absolute otherwise, at any
  depth. The configurator accumulates the whole chain, and the two coordinate
  spaces are distinguishable only by where a widget sits in the document.
- A container is one object in its parent's stacking order, and its children
  stack within it. A widget inside one cannot be raised above a widget outside it
  without raising the whole container.
- Build and destroy order is a correctness requirement, not a style choice. The
  shape type is registered first so every container exists before a child
  resolves it, and destroyed last so children delete their own objects before the
  parent that would otherwise take them down with it.
- A container shape is excluded from incremental update: rebuilding it deletes
  its LVGL object and the descendants with it, so any edit to one forces full
  recomposition. Leaf shapes — most shapes — keep the fast path.
- A widget in a container that is not the visible slot member is not rendered at
  all, so its own conditional rules cannot show it.
- The slot source of every container must be sent to SimHub like a widget's, or
  its rules never receive a value.
- Slot geometry is enforced, not inferred: editing the box of one member is
  editing the box of all of them.
- Both selection mechanisms are optional. A shape with children and no slot is
  simply a container that moves as one in the editor.
- A dashboard authored against schema 8 or earlier is not accepted by schema 9
  firmware, which is what the version bump records.
