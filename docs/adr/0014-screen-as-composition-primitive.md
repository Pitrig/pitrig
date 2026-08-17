# ADR 0014: Screen as Composition Primitive

Status: Accepted; supersedes the single-coordinate-space decision in ADR 0007.
Amended in schema 5: widget storage moved from the screen to a dashboard-wide
pool, which removed the reason the screen count was expensive. The navigation
left out of scope here is decided in ADR 0020, and ADR 0021 adds a second parent
level below the screen.

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
carries its own identifier, background colour, and widget list.

The dashboard, not the screen, owns the typed widget storage: one pool per
widget type, shared by every screen. A screen holds only its ordered
`WidgetReference` list into that pool, and each pooled widget records the
`screen_index` it belongs to. The wire format is unchanged — widgets are still
authored inside a screen's `widgets` array, and the parser fans them out into
the pool while appending the reference.

Storing widgets per screen would have made `ScreenConfiguration` 32 KB and
multiplied it by the screen count, twice over because a staged document sits
beside the active one. With the pool a screen costs its reference table, so the
screen count stopped being a RAM-budget decision.

In firmware, `dashboard::Layout` carries the screens alongside the display, and
geometry resolves the parent from the widget's own `screen_index`. Widgets
neither know nor ask which screen they are on. The boot splash and the
diagnostics view take a screen from their caller instead of deriving one.

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
- A pool slot belongs to exactly one screen, because an LVGL object has one
  parent. Sharing one widget across screens would need an object per screen and
  is deliberately not expressible.
- Adding a screen costs its reference table rather than a full set of widget
  arrays, so the screen count is bounded by what navigation can usefully drive
  rather than by RAM.
- Every per-type cap is now a dashboard-wide budget: 32 text widgets is 32
  across all screens, not 32 per screen.
- Composition walks the pool instead of a screen's widget arrays, which also
  means a widget is bound, font-checked, and compared exactly once however many
  screens reference it.
