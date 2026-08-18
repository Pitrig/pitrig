# ADR 0021: Nested Containers, Slots and Pages

Status: Accepted; takes the extension ADR 0007 reserved and extends ADR 0014 one
level down. Introduced in schema 6 as a separate `group` primitive; replaced in
schema 9 by the shape widget, which now holds widgets and no longer clips them;
the slot separated from the shape into a widget type of its own in schema 10.

## Superseded decisions

Schema 6 through 8 had `screen.groups`: a list of `GroupConfiguration` records,
each an invisible rectangle with an id, a box, a slot and its own `widgets`
array, and a `group_index` on every widget beside its `screen_index`. Everything
that record did is now done by the shape widget, and `screen.groups` is gone.
Two decisions from that version are reversed outright and recorded below:
children were clipped to the container, and nesting was out of scope.

Schema 9 made a slot a number on a container shape: shapes carrying the same
`slot` were the alternatives, and validation held them together by refusing any
that disagreed on box, screen or parent. That is reversed in schema 10 and
recorded below. What went wrong was not the behaviour but where it lived. An area
that switches was five cross-widget rules over a set of shapes that had no name
between them, rather than one object; the author kept the boxes in step by hand
while the editor watched; the slot controller and the frame painter both wrote
`LV_OBJ_FLAG_HIDDEN`, reconciled only by refusing hiding rules on a member; and a
slot number was a dashboard-wide namespace capped at four even though every
member of one had to share a screen and a parent anyway. The `slot`,
`slot_default`, `slot_source` and `slot_conditions` properties are gone from the
shape.

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
`parent_index` and a `parent_kind` beside the `screen_index` it already stamps.
`parent_kind` says which table `parent_index` addresses — the shape pool, or the
flat page table below — so a parent is named by an index rather than a name, and
no lookup happens at runtime. A widget belongs to exactly one container for the
same reason it belongs to exactly one screen: an LVGL object has one parent.

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

That extra draw size is **measured**, not maximal. LVGL clips a container's
children to its box grown by that size, and `lv_obj_invalidate` grows the
invalidated area by it too — so a container declaring a display-sized overflow
would repaint the whole screen every time a styling rule repaints it, which at
blink rate is a frame-budget regression on the S3. Composition therefore measures
what each container's children actually reach, walking the pool backwards so a
nested container's own figure is final before the container above folds it in.

Because the number is what decides the clip rather than merely the invalidation,
it is a fact about where the children ended up, and an incremental apply moves
them. The measurement is therefore re-run on that path as well, not only on a
full composition; otherwise a widget dragged past its container's edge is clipped
to a box that stopped describing it.

The one bound left on geometry is the display. A box is refused only when it is
entirely outside it, because the display is the only edge with no pixels beyond
it. Everything else — a caption overhanging a border, a readout hanging past the
panel it belongs to, a negative relative coordinate — is authoring, not error.

### The slot is a widget, and it holds pages

A **slot** is a widget type of its own: an area of a screen that switches what it
shows. It holds a bounded array of **pages**, and exactly one page is visible.

A page is deliberately not a widget. It has no id, no box, no styling, no action
and no place in a stacking order — it is the slot's box, and the widgets on it
are placed relative to that. What it is, at runtime, is one bare LVGL object: a
page is shown or hidden with a single flag write on that object rather than one
per widget on it, and because the flag is written on the page instead of on the
widgets, nothing here touches the flag the frame painter owns. The hiding rule
that schema 9 had to refuse on a slot member is ordinary again.

Pages have no pool of their own either. A slot's pool index times
`kMaximumSlotPages` plus the page addresses the flat table the layout resolves a
parent through — arithmetic rather than a counter, which is also why the product
has to fit the `std::uint8_t` a parent index is.

A page costs no nesting level. `kMaximumNestingDepth` bounds the parser's own
recursion, and a page adds none — the parser walks a slot's pages inline rather
than through another `parse_widget` frame — so charging for one would buy the
author a level less inside a slot than outside it and buy the stack nothing.
A slot therefore spends exactly what a container shape spends, and nesting
shapes inside a slot page works to the same depth as nesting them anywhere
else.

The slot itself **draws nothing**. Every property that would paint it —
background, border, radius, caption, colour ramp, styling rules — is refused
rather than ignored, because an author who reaches for a background and gets
silence learns nothing. An area that wants a plate behind it puts a shape there,
which is a widget the author can already see and stack.

The slot is authored **directly on a screen**, never inside a container. That is
not about coordinate spaces — a slot on a page or in a shape would work — but
about build order: composition builds one pool per type, and two mutually
nestable container types have no single pass order that satisfies both. Slots
first, then shapes, then the rest is an order that always works, and it is only
an order that always works because a slot never sits under a shape. The schema
says so by listing `slot` in the screen's variant map and in no other, so it is a
document that cannot be written rather than a rule applied after the fact.

### What raises a page

Two things select the visible page, and they are the two the dashboard already
has: a finger, and telemetry.

A tap anywhere on the slot advances to the next page **in the loop**. A page
carries `in_loop`, so a page meant only as an alert is left out of the sequence
and is unreachable by tapping. The tap costs no change to any widget: every
widget removes its clickable flag as it builds, slots are attached afterwards and
put the flag back on themselves, and a child that does not take a click lets it
reach the slot. A widget with an action inside a page consumes the tap and the
slot does not cycle — that is not a rule of its own, it is what event bubbling
already does.

Telemetry raises a page over the loop. A page names a `source` and a `trigger`:

- `conditions` reuses conditional styling wholesale — the same operators, the
  same bounded ordered rule list, the same LVGL-free resolver — and raises the
  page while a rule holds.
- `value_changed` raises it whenever the value differs from the last one seen.
  This is the one thing the styling model cannot express, and it is the case the
  dashboard most wants: an aid such as ABS or traction control that is
  interesting *because it just changed*, with no threshold to name. The first
  reading is what a change is measured against rather than a change in itself, so
  a slot does not flash its alerts at startup, and an unavailable source forgets
  its history rather than reporting a change when it returns.

What holds the page up is `duration_ms`, on the page rather than on the rule that
raised it, because a page is raised as a whole. It is bounded by the same ten
seconds a styling hold is: past that a page stops reading as a reaction to the
car and starts reading as a stuck dashboard. `value_changed` requires one — a
momentary trigger with no duration is a page that never appears — while
`conditions` may leave it at zero and hold the page exactly as long as a rule
matches. Re-firing restarts the duration, so a trigger that keeps going keeps its
page up.

Priority among triggered pages is **document order**: the first page whose event
is live wins. There is no rank field, because the array is already an order and
the editor already reorders it.

Where the two disagree, telemetry wins, and the way it wins is the model ADR 0017
already established. When no event is live the slot shows the loop page last
selected, or the first page in the loop before anything has been tapped. So a
dashboard cannot latch into a state its telemetry has left behind, pulling the
cable returns the slot to a page the author chose, and an event hands the slot
straight back to the view the driver picked.

While an event is up, a tap does nothing. Cycling the loop underneath would be
invisible, and dismissing the event would only fight a threshold trigger that is
still holding; the more urgent thing to look at wins for as long as it lasts.

### Out of scope

A widget in more than one container, a container spanning screens, animated page
transitions, a slot inside a container, and layout of any kind stay out. Each
would either introduce the unbounded scene graph ADR 0007 refused, a second
parent, or a build order that has no single pass. Nesting, which the first
version of this ADR excluded, is now in.

## Consequences

- An area of a screen can change its contents from telemetry or from a tap,
  authored once on the area instead of repeated per widget — and the area is one
  object with one box, so the alternatives cannot drift apart.
- One concept instead of two, twice over. A container that needs a visible plate
  is the plate, and an area that switches is one widget rather than a set of
  shapes agreeing on a number. Five cross-widget validation rules are gone with
  it, along with the flag both the painter and the slot controller used to write.
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
- Build and destroy order is a correctness requirement, not a style choice. Slot
  is registered first and shape second, so every container exists before a child
  resolves it, and both are destroyed last so children delete their own objects
  before the parent that would otherwise take them down with it. That order is
  only sufficient because a slot cannot sit inside a shape.
- A container is excluded from incremental update: rebuilding it deletes its LVGL
  object and the descendants with it, so any edit forces full recomposition. A
  slot is always a container; leaf shapes — most shapes — keep the fast path.
- A widget on a page that is not the visible one is not rendered at all, so its
  own conditional rules cannot show it.
- The source of every slot page must be sent to SimHub like a widget's, or its
  trigger never receives a value.
- A slot's box is the box of every page, so there is nothing to keep in step: the
  geometry rule schema 9 enforced across members is now simply unrepresentable.
- Everything is optional. A slot with two plain pages is an area a tap cycles; a
  shape with children and no slot is a container that moves as one in the editor.
- `value_changed` compares exactly, so it is meant for booleans and discrete
  levels. A float that drifts would fire on every reading.
- A dashboard authored against schema 9 or earlier is not accepted by schema 10
  firmware, which is what the version bump records. The two slot models do not
  correspond — several shapes agreeing on a box are not one slot with several
  pages — so migration drops the old properties rather than guessing, and the
  shapes stay as ordinary containers.
