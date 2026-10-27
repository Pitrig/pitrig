# ADR 0039: Per-Game Telemetry Sources

Status: Accepted. Extends the SimHub mappings of
[ADR 0005](0005-telemetry-ingestion-boundaries.md), read by the plugin of
[ADR 0035](0035-simhub-plugin-feeds-the-board.md) and the Custom Serial profile.

## Context

SimHub's generic game data covers the common values — revs, fuel, tyres, flags
— and nothing more. Damage, weather, the track's grip, penalties, the car's
electronics and hybrid energy exist only in each game's own data, which SimHub
publishes under `DataCorePlugin.GameRawData` with a different shape per game.
Forty-three catalog mappings named generic properties that SimHub never had, so
those fields never carried a value in any game.

## Decision

**A mapping names its games.** `games` in `telemetry/simhub_generic_mappings.json`
lists which of the tracked games — ACC, AC, iRacing and LMU, each with its
SimHub game code in the top-level `games` table — send the field. `true` means
the generic source works there; an object gives that game's raw property
(arrays flattened as `Name01`…, wheels through `{index}` and `{corner}`) and at
most one transform: a `scale`, a `values` table with an optional `default`, a
`bit` of a bitfield, or a `clock` that turns seconds of the day into `HH:MM`. A
field no tracked game sends lists none and keeps its placeholder, and no
mapping names a generic property that does not exist.

**Both paths pick the current game.** The plugin reads the source of
`GameData.GameName` before the generic one; the profile generator turns the
same table into a JavaScript switch on `DataCorePlugin.CurrentGame`. A game's
source counts only while the game runs, because SimHub keeps the last raw data
of a closed game. The
generated catalog carries the list, so the editor's field picker and the
Protocol page show which games send a field.

## Consequences

- A new game is an entry in the `games` table and its sources; nothing in the
  firmware changes.
- The ACC and AC sources were checked live against SimHub's own values; the
  iRacing and LMU ones come from SimHub's reader structures and need a session
  of each game to confirm.
- `vehicle.aids.traction_control_cut` (`TC`) and `vehicle.energy.virtual`
  (`VE`) fill the catalog to its 256 fields; another field means raising that
  limit first.
