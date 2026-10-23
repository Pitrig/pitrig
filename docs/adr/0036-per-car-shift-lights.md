# ADR 0036: Per-Car Shift Lights

Status: Accepted. Adds two fields to the catalog of
[ADR 0005](0005-telemetry-ingestion-boundaries.md), computed by the plugin of
[ADR 0035](0035-simhub-plugin-feeds-the-board.md).

## Context

The shift-light preset stepped across `engine.rpm_percent` from 70 % to 97 % of
maximum RPM, the same in every car and every gear, while a car's own lights
depend on the car and often on the gear. Hand-curated tables of every car's
lights exist, but under licences a GPL and Apache project cannot carry.

## Decision

`engine.shift_progress` (`SP`) is how far the current gear has gone from the
car's first shift light to its full bar, 0 to 100 %, and `engine.shift_now`
(`SN`) is whether the engine has reached the shift point. `engine.shift_rpm`
comes from the same computation. The plugin takes the first source that
answers: iRacing's per-gear `PlayerCarSL*RPM`, then its per-car
`DriverCarSL*RPM`; F1's own `m_revLightsPercent`; RaceRoom's `UpshiftRps`; the
current gear's redline from SimHub's car settings, with the bar starting at
85 % of it; and last, 97 % of maximum RPM. The Custom Serial profile computes
only the SimHub-settings rung. The configurator's shift-light preset steps
across `engine.shift_progress` and flashes on `engine.shift_now`.

## Consequences

- Both fields have explicit uppercase wire ids, so no automatic id moves; a
  board reads them once it carries the regenerated catalog.
- The raw property paths are checked against a live SimHub, not here.
- No third-party car data in the repository; a car the game describes is lit
  as the game describes it, and any other as SimHub's car settings say.
