# ADR 0048: Display Panel Variants

Status: Accepted.

## Context

Guition JC1060P470C boards sold since 2026 carry Guition's New_Panel display:
other glass on the same JD9165 controller (Pitrig/pitrig#7). Guition's demos
for the two panels differ only in the initialization table and one timing, and
neither table works on the other panel: the original table leaves the new panel
showing stripes, and the new table doubles and shifts the picture on the
original panel. The controller answers its ID read with `00 00 00`, so the
firmware cannot tell the panels apart. Guition ships one firmware per panel; a
second Pitrig image would need a second board identity, which saved documents,
templates and released configurators would reject.

## Decision

- A display driver may list the panels its board is sold with, oldest first,
  each with its own colour profile (ADR 0047). Startup passes the chosen index
  to the driver's `initialize`. A driver that lists none drives one panel.
- The choice is a board record in its own NVS namespace, `pitrig_board`, in
  the `pitrig_cfg` partition, so `RESET` keeps it. It holds a panel, or a check
  in progress with the panel on trial and the tries made.
- With no record, a board that holds a stored document ran an earlier release,
  which drove the oldest panel, so it keeps that panel. A board with none
  starts a check, newest panel first.
- During a check the board starts as usual on the panel on trial and then lays
  a screen over the dashboard: hold a tick for two seconds. The tick sits in one
  of six places, chosen afresh each try, and is drawn rather than written, as
  the board has no font to spare. Holding it stores the panel. After 25 seconds
  without it the board stores the next panel and restarts, so every try is a
  whole, ordinary start; while a host has written to the board in the last 15
  seconds or holds an upload, the countdown starts again instead. Ten tries,
  about five minutes, end the check until the next start the firmware did not
  cause itself — a power-on or a reset from outside, not a restart, a panic or
  a watchdog — and until then the board drives the newest panel. A start
  without touch input shows no check and leaves it for the next.
- `@PR:PANEL` reads the panel index, or `check` while a check runs, and
  `@PR:PANEL:<index|check>` stores it for the next start. A board with one panel
  answers `unsupported`. A record this firmware cannot read is left alone and
  the board drives the oldest panel.
  The configurator offers the choice to a board that answers.

## Consequences

- No schema, partition or document change: a board updated from an earlier
  release that holds a stored document keeps its panel, its documents and its
  templates; one that holds none, never saved or reset to factory, checks like
  a clean install. A board with the new panel that saved a dashboard under an
  earlier release keeps the stripes until the configurator switches it once.
- A clean install on the original panel shows the doubled picture for one try
  before its own panel comes up.
- Older firmware ignores the record. Rolling such a board back to it brings the
  stripes back.
- Startup keeps its phases: the check begins after composition, and its
  restarts are software resets, which `boot_guard` does not count as failures.
- Confirming needs touch that reports panel coordinates. Touch that answers
  but lands elsewhere leaves each power-on running the check to its end on the
  newest panel, about five minutes, until the configurator sets the panel.
