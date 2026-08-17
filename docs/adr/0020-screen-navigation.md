# ADR 0020: Screen Navigation

Status: Accepted; completes the seam ADR 0014 left open. Amended in schema 7:
a widget or a group may carry a tap that navigates, which narrows — but does not
remove — the rule that navigation is unauthored.

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

Applying a configuration returns to screen zero. A rebuilt dashboard has new
screen objects, and continuing to show "screen three" across a document that may
no longer have one is a way to display a screen the author is not editing.

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

So a widget and a group may each carry one **action**: `next_screen`,
`previous_screen`, or `goto_screen`. A tap on that object performs it.

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

A group in a slot already spends its tap on cycling its own contents, so a group
that carries both a slot and an action would give one tap two meanings.
Validation refuses it rather than ranking them.

A widget with an action inside a slot group consumes the tap, and the slot does
not cycle. That is not a rule of its own — it is what event bubbling already
does, and it is the behaviour an author would expect from a button drawn inside
an area.

Bindings live in the navigation controller, which already owns the screens and
the active index, and are bounded at sixteen for the whole dashboard. They are
re-established after any rebuild: applying a configuration replaces a widget's
LVGL object, and the replacement carries neither the clickable flag nor the
callback.

## Consequences

- A dashboard may hold up to four screens, and the driver swipes between them.
- Adding a screen costs a reference table; the widget budget is unchanged and
  still shared across every screen.
- How a dashboard moves is still not authorable — order, gesture and transition
  are fixed. Which objects move it is authorable, as one property per widget or
  group.
- An empty group is an invisible rectangle that takes a tap, which is how "this
  corner goes back" is expressed without a widget to press.
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
- Applying a configuration is visible as a jump back to the first screen.
- Transitions are LVGL's stock animations. An authored transition, per-screen
  duration, or vertical navigation would each be an extension of this decision.
