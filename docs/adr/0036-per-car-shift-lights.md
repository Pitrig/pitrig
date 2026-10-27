# ADR 0036: Per-Car Shift Lights

Status: Accepted. Adds a field to the catalog of
[ADR 0005](0005-telemetry-ingestion-boundaries.md), computed by the plugin of
[ADR 0035](0035-simhub-plugin-feeds-the-board.md).

## Context

The shift-light preset stepped across `engine.rpm_percent`, the same in every
car and every gear. Release 0.2.0 added `engine.shift_percent` and
`engine.redline_reached` against the current gear's shift point from SimHub's
car settings, which a car only has once someone has set it up, while iRacing, F1
and RaceRoom describe the car's own lights. Hand-curated tables of every car's
lights exist, but under licences a GPL and Apache project cannot carry.

## Decision

The plugin takes a car's shift point from the first source that answers:
iRacing's per-gear `PlayerCarSL*RPM`, then its per-car `DriverCarSL*RPM`; F1's
own `m_revLightsPercent`; RaceRoom's `UpshiftRps`; the current gear's redline
from SimHub's car settings, with the bar starting at 85 % of it; and last, 97 %
of maximum RPM. From that one answer it computes `engine.shift_rpm`,
`engine.shift_percent` (the revs against the shift point),
`engine.redline_reached` (the shift point is reached) and
`engine.shift_progress` (`SP`), how far the current gear has gone from the car's
first shift light to its full bar, 0 to 100 %. The configurator's shift-light preset
steps across `engine.shift_progress` and flashes on `engine.redline_reached`.

## Consequences

- The 0.2.0 fields keep their names and wire ids; the new one has an explicit
  uppercase wire id, so no automatic id moves, and a board reads it once it
  carries the regenerated catalog.
- The raw property paths are checked against a live SimHub, not here.
- No third-party car data in the repository; a car the game describes is lit
  as the game describes it, and any other as SimHub's car settings say.
