# ADR 0019: Input Interface and Touch Drivers

Status: Accepted

## Context

SimCore has no input of any kind. There is no `interfaces/input` contract, no
touch, button, or encoder driver, and nothing anywhere creates an `lv_indev`.
Every widget goes further and removes `LV_OBJ_FLAG_CLICKABLE` from the object it
builds, so even if a pointer device existed the dashboard would ignore it.

That is now the blocker in front of two accepted features: moving between
dashboard screens, and switching what a region of a screen shows. Both need a
pointer before either can be driven by hand.

The hardware is asymmetric. Both Guition boards carry a GT911 capacitive panel
on the board's own I2C bus; the LilyGO T-Display-S3 has no digitizer at all.
Whatever the contract looks like, a board without input must remain a normal,
fully working board rather than a special case threaded through the core.

`esp_lvgl_port` already ships `lvgl_port_add_touch`, and its header compiles the
touch path in only when `esp_lcd_touch.h` is reachable. So the LVGL side is a
dependency decision, not an implementation.

## Decision

Mirror the display boundary exactly, because input has the same shape: a
board-specific initialization that produces a handle, and a framework component
that adapts the handle to LVGL.

`interfaces/input` is a new contract component holding a POD driver descriptor —
a stable name and an initialization callback returning a configuration that
carries the `esp_lcd_touch` handle. Exposing that handle in the contract is
deliberate and is the same trade the display interface already makes: the
interface is for the platform layer to consume, and UI, modules, and application
configuration must not depend on it.

`BoardDefinition` gains the input driver as a **pointer**, not a reference, so
absence is expressible. The T-Display-S3 descriptor leaves it null and nothing
else in the firmware learns that a board can lack input. A null driver is a
board fact, never an error.

The GT911 implementation lives in one driver component shared by both Guition
boards and parameterized by pins, in the same way one UART transport driver
serves every board that has a UART. The board driver supplies its own pins; the
controller sequence stays in one place.

`components/input` owns the LVGL binding and nothing else: one function that
takes a driver and returns an `lv_indev_t*` through `lvgl_port_add_touch`. The
core calls it directly after `display::initialize`, guarded by the null check,
and never names a controller or a board.

The input device is created once and lives for the lifetime of the firmware. It
survives dashboard teardown and rebuild for the same reason the render trigger
does: applying a configuration replaces widgets, not hardware.

Input introduces no task and no event-bus traffic. The port's LVGL task already
polls the controller, so an input event reaches the dashboard as an LVGL event on
the object that was touched. This matters more than it looks: the event bus takes
a mutex when publishing and therefore cannot be published to from an interrupt,
and ADR 0011 refuses a central scheduler. Letting LVGL deliver input keeps both
rules intact without inventing a bridge.

Buttons and encoders are out of scope here. A button is a second driver behind
the same contract, but an encoder additionally needs a focus model — `lv_group`
— that nothing in the dashboard has today, and that is its own decision.

## Consequences

- The two Guition boards gain touch; the T-Display-S3 builds and runs unchanged,
  with a null driver and nothing initialized. The GT911 code is still linked into
  an ESP32-S3 image, for the same reason the Guition display driver already is:
  component requirements resolve before the Kconfig board choice.
- Any interaction the dashboard offers is unavailable on a board with no
  digitizer. Features that must work on every board have to be reachable from
  telemetry as well as from a finger.
- The core stays free of hardware switches: one null check, no board identity.
- A touch controller on a future board is a driver plus one line in its board
  descriptor.
- The `esp_lcd_touch_gt911` dependency enters both dependency locks, and the
  ESP32-P4 lock is regenerated separately from the ESP32-S3 one.
- Input cannot be observed by modules, because it is not on the event bus. A
  module that needs to react to input would require a decision about how input
  crosses that boundary.
- Widgets are built refusing clicks. Amended by ADR 0020: a widget that carries
  a navigation action has that undone for it — by the composition, walking the
  same reference tables the z-order pass walks, so no widget type learns about
  input.
