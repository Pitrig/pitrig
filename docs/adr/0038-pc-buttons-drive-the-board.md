# ADR 0038: PC Buttons Drive the Board

Status: Accepted. Builds on [ADR 0020](0020-screen-navigation.md) and
[ADR 0021](0021-widget-groups-and-slots.md), whose screens and slots the
buttons now move, on [ADR 0024](0024-separate-configuration-documents.md), whose
documents carry the new sections, and on
[ADR 0035](0035-simhub-plugin-feeds-the-board.md), whose plugin carries the
button states.

## Context

A driver changes screens and pages, dims the display or silences the lamps
mid-stint, and a touch screen is the wrong place for it with gloves on. The
buttons that matter — on the rim, a button box, a gamepad, the keyboard — are
on the PC, where SimHub already reads every one of them. A board has one serial
link and a telemetry catalog capped at 256 fields, 252 of which were taken.

## Decision

**Buttons travel as telemetry.** The plugin sends `input.buttons`, a bitmask of
16 logical buttons, and `input.switch`, the position of one multi-position
switch, in the ordinary line format. It sets them from its SimHub actions
`ButtonN` and `SwitchPositionN` and from the PC inputs the modules document
names, so the board never sees a device, and the catalog grows by two fields
rather than seventeen. A tap shorter than 60 ms still lasts 60 ms, and an
action SimHub fires with no input held — an event, the web API — is a tap,
since no release follows it. While the configurator holds a board it sends the
draft's wiring with its request and the plugin uses that for the board, the
way live apply shows the draft's dashboard. A condition's `bit_set` reads one
logical button out of `input.buttons`, so a widget or a lamp can follow one.

**The wiring and the actions live apart.** Which PC input is logical button N,
its name and the switch positions are the modules document's `inputs`, a
section marked `host_only` in the schema: firmware accepts the key, keeps it in
the stored payload and generates no structure for it. What the buttons do on a
dashboard is `dashboard.controls` — the actions, the slot the switch drives,
the rules that bring a screen forward on a game event and the idle return home
— with a return-home time per slot and a dismissal behaviour per slot page.
Changing the dashboard keeps the wiring, and a template brings its own actions.

**The board does the timing.** The `controls` module samples both fields every
10 ms on its own task, runs only while a dashboard has controls, and turns edges
into actions: one step per press, a repeat after 400 ms and then every 150 ms
for a binding that asks for it, held screens and pages until release. Telemetry
silent for 1.5 s releases every button, so a stopped plugin never leaves one
down. Rules take the first that holds and go back when it ends unless the
screen was moved meanwhile; the dashboard returns home after its idle time,
where any screen change counts as activity; a session that starts again, seen as
`session.time_elapsed` running backwards, clears session dismissals.

**The module never touches LVGL.** Screens and slots are driven through
`controls::DashboardTarget`, which the dashboard composition implements with a
queue an LVGL timer drains, and LED commands are a `LedControl` event the
`rgb_leds` module scales its output by. The backlight dims through LEDC on the
pin each display driver names; its level is a two-byte settings record beside
the documents, written two seconds after the last step and read before the
display comes up, so a dimmed board never flashes at full brightness on boot.
LED brightness and the all-off switch last until the next restart.

## Consequences

- The catalog holds 254 of 256 fields. The Custom Serial profile sends 0 for
  both, so buttons need the plugin.
- A dashboard with controls costs one more task with a 3 KB stack.
- `RESET` erases the brightness with the documents, and a board on firmware
  older than schema 27 refuses `controls` like any unknown property.
- Hold and repeat timings are fixed in firmware rather than configured.
