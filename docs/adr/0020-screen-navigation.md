# ADR 0020: Screen Navigation

Status: Accepted; completes the seam ADR 0014 left open. Amended in schema 7:
any widget may carry a tap that navigates, which narrows — but does not
remove — the rule that navigation is unauthored. Amended in schema 15: whether
the transition animates is authored too. Amended by
[ADR 0027](0027-partial-render-buffers-and-unsynchronized-scan-out.md): the
controller now also switches the display into its tear-free rendering mode for
the duration of every transition and back one refresh after the new screen
settles, so the frame-rate trade the amendment below describes still holds but
the drawing underneath it changed.

## Context

ADR 0014 made the screen an explicit composition primitive and then stopped one
step short on purpose: it said navigation, gestures, and transitions "require
their own decision", and it left a single function that resolves a configured
screen to an LVGL screen, returning the display's active screen for index zero
and nothing for any other index. `kMaximumScreens` has been 1 ever since, so the
structure has been carrying a screen count it never used.

Everything downstream of that function was already written for many screens. The
parser and the validator loop over screens, the control protocol reports a screen
index in its errors, geometry resolves each widget's parent from the widget's own
`screen_index`, and z-ordering already runs per screen. What was missing was a
second screen object and a reason to load it.

The reason arrived with input (ADR 0019). A driver on a Guition board can now
swipe.

## Decision

Raise the screen count to four and navigate between them by horizontal swipe.

Four is a navigation bound, not a memory one. A screen costs its reference table
because the widgets live in the dashboard pool, and the per-type caps stay
dashboard-wide budgets — four screens do not buy four times the widgets. What
bounds the count is how many screens a driver can plausibly reach mid-corner.

Screen zero remains the display's active screen and screens above it are created
and owned by the composition. The asymmetry is deliberate. The boot splash, the
initial black paint, and the forced-refresh invalidation all reach for the
display's active screen, and keeping index zero as that object leaves every one
of them correct without a second mechanism. Teardown loads screen zero before
deleting the screens it owns, because LVGL will not delete the screen that is
loaded.

Navigation is behaviour of the composition, not a property in the document. A
screen carries no navigation configuration: the order is the order the screens
are authored in, movement wraps at both ends, and the gesture is the same on
every screen. There is nothing to author, so there is nothing to get wrong, and
the contract does not grow a field that only one input device can satisfy.

The transition is LVGL's own animated screen load, which does not delete the
screen it leaves. Screens outlive navigation; only a configuration replacement
destroys them.

A full recomposition returns to screen zero. A rebuilt dashboard has new
screen objects, and continuing to show "screen three" across a document that may
no longer have one is a way to display a screen the author is not editing. An
incremental apply (ADR 0016) keeps the screen objects and so keeps the screen
being shown, which is what a live preview of an edit on that screen wants.

Widgets on screens that are not loaded are not drawn, and nothing in the
dashboard has to arrange that. LVGL drops an invalidation whose object belongs to
a screen that is neither loaded nor animating out, so a widget on a hidden screen
still reads its sources and still formats its value on its type's shared timer,
but produces no dirty area and no draw. What extra screens cost is therefore
value computation, not per-frame rendering, and the widget state, bindings, and
LVGL objects all persist so a screen returns showing current values rather than
being rebuilt.

A gate that skips the computation as well was considered and deliberately not
built. It would have to reach into every widget type, because a type's timer
wakes all of its instances at once regardless of where they are, and the work it
would save is string formatting rather than pixels. If four screens ever show up
in a profile, that is the change to make, and it is confined to the widget
types.

A board without a digitizer has no way to reach a second screen. That is stated
here rather than solved: it is the direct consequence of ADR 0019, and it is
resolved by adding button input, not by adding an escape hatch to this decision.

## Amendment: authored navigation

Introduced in schema 7.

Swiping is the whole of navigation only on a dashboard the driver can swipe on,
and only where a swipe is the gesture that fits. A readout that doubles as a
button — `LAP`, `PIT` — and a corner of the screen that goes back are both
things a dashboard wants to say, and neither is expressible by "the gesture is
the same on every screen".

So a widget may carry one **action**: `next_screen`, `previous_screen`, or
`goto_screen`. A tap on that object performs it.

The claim this replaces read "navigation is behaviour of the composition, not a
property in the document". What stays true is narrower and is what the original
decision was actually protecting: **the order of the screens, the swipe, and the
transition remain unauthored.** There is still nothing to configure about how a
dashboard moves; what is authored is only which objects also move it.

`goto_screen` names its target by the screen's `id`, not by its position. Ids
exist for exactly this — ADR 0013 kept them so that "selection, history, and any
future addressing survive reordering and deletion" — and a document that reads
`"screen": "pit"` says where a tap goes, which `"screen": 2` does not. The name
is resolved to an index once, in the composition, beside where a font family is
resolved and for the same reason: a tap looks nothing up.

A slot already spends its tap on cycling its pages, so a slot that carried an
action as well would give one tap two meanings. Validation refuses it rather
than ranking them.

A widget with an action on one of a slot's pages consumes the tap, and the slot
does not cycle. That is not a rule of its own — it is what event bubbling
already does, and it is the behaviour an author would expect from a button
drawn inside an area.

Bindings live in the navigation controller, which already owns the screens and
the active index, and are bounded at sixteen for the whole dashboard. They are
re-established after any rebuild: applying a configuration replaces a widget's
LVGL object, and the replacement carries neither the clickable flag nor the
callback.

## Amendment: authored transition

Introduced in schema 15.

The animated screen load draws both screens for every frame it runs: the one
arriving and the one being left, each composited at its own offset. A screen
carrying a handful of readouts absorbs that; a screen filled to the widget caps
does not, and the drop is visible for exactly as long as the swipe lasts — the
one moment the driver is looking at the transition rather than at a value.

So a dashboard carries `transition`: `slide`, the animation described above, or
`none`, which replaces the screen in a single frame. It governs every move
between screens, whether a swipe or a tap asked for it, and both paths reach it
through one function in the controller so the two cannot be drawn differently.

The claim this narrows read "the order of the screens, the swipe, and the
transition remain unauthored". The order and the swipe still are. The transition
is not, and what remains true of it is smaller: **there is one transition for
the whole dashboard, and it is a choice between animating and not.** Neither the
direction nor the duration is authorable — the direction is what the navigation
means rather than a preference, and a duration would be a third answer to a
question that has two.

Dashboard-wide rather than per screen, because the cost belongs to the pair. A
screen that declared itself instant would still be animated out of when the
driver swiped back to it from a neighbour that had not, so the property would
hold in one direction and quietly fail in the other. Naming the dashboard is the
only place the answer is the same whichever way the swipe goes.

The controller takes it as a setting rather than as a parameter of `attach()`.
A document may change how it moves and nothing else — an edit no widget pass
would notice — so every apply sets it, including the incremental one, which is
what lets the configurator's live preview show the change without a rebuild.

## Consequences

- A dashboard may hold up to four screens, and the driver swipes between them.
- Adding a screen costs a reference table; the widget budget is unchanged and
  still shared across every screen.
- Where a dashboard moves is still not authorable — order and gesture are fixed.
  Which objects move it is authorable, as one property per widget, and whether
  the move animates is authorable, as one property for the dashboard.
- A dashboard dense enough to stutter mid-swipe has an answer that costs nothing
  at rest: `transition: none` removes the frames that draw two screens at once
  without touching what either screen holds.
- An empty transparent shape is an invisible rectangle that takes a tap, which
  is how "this corner goes back" is expressed without a widget to press.
- A tap target costs a binding and makes one object clickable; sixteen of them
  is the dashboard-wide bound.
- On the T-Display-S3 a document with more than one screen validates, applies,
  and shows only its first screen. Nothing warns about this on the device; the
  configurator is the place to say it.
- The single function ADR 0014 named is still the only place that decides what an
  LVGL screen is, and screen zero still behaves exactly as it did.
- Hidden screens cost memory and their widgets' value computation, but no draw
  time. A widget that has been off-screen shows the current value on return
  rather than a stale one.
- Applying a configuration that needs a full recomposition is visible as a jump
  back to the first screen; an incremental apply stays on the current one.
- Transitions are LVGL's stock animations, and the choice between them is one
  bit. A per-screen duration, a second animation to pick from, or vertical
  navigation would each be a further extension of this decision.
