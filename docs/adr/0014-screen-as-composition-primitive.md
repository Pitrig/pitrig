# ADR 0014: Screen as Composition Primitive

Status: Accepted; supersedes the single-coordinate-space decision in ADR 0007

## Context

ADR 0007 removed layout regions and made the display screen the only
configuration coordinate space. That was correct while a dashboard was one
screen, and it left the door open: shared visual grouping was to be represented
by "an explicit widget or another future composition primitive".

Planned work needs several dashboard screens the driver can move between. The
obstacle was not the amount of code but a hidden assumption: every widget's
parent was rediscovered from the display. `resolve_widget_bounds` called
`lv_display_get_screen_active`, and so did the boot splash and the display
diagnostics view. Nothing named a screen, so nothing could own more than one.

## Decision

Make the screen an explicit composition primitive and the coordinate space for
the widgets it owns.

In the contract, the dashboard owns a bounded `screens` array. Each screen
carries its own identifier, background colour, and widget list. `kMaximumScreens`
is one for now; raising it multiplies per-screen widget storage and requires an
explicit RAM-budget review.

In firmware, `dashboard::Layout` carries the screen alongside the display, and
geometry resolves against `layout.screen`. Widgets neither know nor ask which
screen they are on. The boot splash and the diagnostics view take a screen from
their caller instead of deriving one.

Resolve a configured screen to an LVGL screen in exactly one function in the
dashboard composition. Until navigation exists it returns the display's active
screen for index zero. Creating additional LVGL screens and swapping them is a
change to that function, not to widgets, layout, or the contract.

Screen navigation, gestures, and transition animations are deliberately out of
scope here and require their own decision.

## Consequences

- Widget geometry is expressed against a screen, so more screens do not change
  how a widget is positioned or rendered.
- One function decides what an LVGL screen is for a configured screen; today it
  preserves current behaviour exactly.
- The absolute `x`, `y`, `width`, `height` model, `z_index` ordering, and the
  refusal of implicit layout containers from ADR 0007 all remain in force.
- Per-screen widget storage is the dominant term in the configuration document's
  size, which is why the screen count is bounded and reviewed rather than open.
