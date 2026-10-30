# SimHub plugin

The Pitrig plugin runs inside SimHub, finds the Pitrig boards connected to the PC
and sends each one the telemetry its documents bind
([ADR 0035](adr/0035-simhub-plugin-feeds-the-board.md)). While the configurator
is connected to a board it takes the board over and passes the plugin's stream on
([ADR 0034](adr/0034-configurator-telemetry-bridge.md)). It writes the line
format of [SimHub telemetry](simhub-custom-serial.md) and is the only source that
does; do not leave a SimHub Custom Serial device on the same port, because
whichever opens it first keeps it.

## Installing

The configurator's Windows installer copies `Pitrig.SimHub.dll` next to
`SimHubWPF.exe`. It finds SimHub in `C:\Program Files (x86)\SimHub` or through its
uninstall entry, asks for administrator rights once when that folder needs them,
and closes and restarts SimHub when it holds an older copy. On its next start
SimHub asks to enable **Pitrig telemetry**; the plugin then appears in the left
menu as **Pitrig**. Uninstalling the configurator leaves the plugin in SimHub.

By hand: close SimHub, copy the DLL attached to the release next to
`SimHubWPF.exe`, and unblock it under the file's properties.

## Finding boards

The plugin lists the COM ports from the registry once a second and opens a
`303A:4001` port — a board on native USB — by itself, after waiting two seconds
from SimHub's start so that a running configurator can claim its board first. A
port behind a USB-UART bridge (`1A86:7523`, `1A86:55D4`, `10C4:EA60`) is opened
only once the configurator has handed it back as a Pitrig board; the plugin
remembers it with its baud rate. A port that does not answer `@PR:INFO` is left
alone until it disappears and comes back.

On a board that answers, the plugin reads the dashboard and modules documents
— only the modules document after a hand-back that names the fields — and sends
the fields they bind, at the catalog rates, changed values only, with
every value repeated within a second, an empty one included, since an empty
value invalidates the field on the board. After a reconnect it sends the fields
of the board's previous session at once and switches to the documents' when
they arrive, and a request the board answers `busy` is sent again. A board that
takes no data for a moment misses updates rather than receiving them late, and
counts as lost only once a write has waited two seconds. A board in safe mode is
shown and left alone. The plugin's page in SimHub has four tabs: Status lists
each board, what it is sent and how many bytes a second, the ports the
configurator holds and the shift-light source of the current car; Settings
applies each change as it is made and saves it a second later; Buttons shows the
logical buttons and the switch position live, with the last input pressed and
what it pressed; About carries the version, the links, the licence and what the
plugin costs SimHub per update.

## Shift lights

`engine.shift_rpm`, `engine.shift_percent`, `engine.shift_progress` and
`engine.redline_reached` ([ADR 0036](adr/0036-per-car-shift-lights.md)) come
from the first source that answers:

| Game | Source |
| --- | --- |
| iRacing | `GameRawData.Telemetry.PlayerCarSL{First,Last,Shift}RPM` for the current gear, else `GameRawData.SessionData.DriverInfo.DriverCarSL…RPM` for the car |
| F1 | `GameRawData.PlayerCarTelemetryData.m_revLightsPercent` |
| RaceRoom | `GameRawData.UpshiftRps`, in radians a second |
| Any | `CarSettings_CurrentGearRedLineRPM` from SimHub's car settings, the bar starting at 85 % of it |
| Any | 97 % of the maximum RPM, SimHub's car settings first |

The raw paths are the ones SimHub publishes; check them in SimHub's property
list, with game-specific properties shown, when a game misbehaves.

## Values

A mapping's `unavailable_when` names the values a game uses to mean nothing — an
`EngineMap` of −1, a water temperature of 0 — and the plugin sends them empty, so
the board draws the widget's `unavailable_text`. A `uint32` field refuses a
negative value the same way, because the board cannot parse one. The estimated
lap time and the live delta are sent as the tracker reports them; only the sector
delta drops a live delta more than a fifth of a lap under the best, because a
replay or a switched car would otherwise produce a nonsensical sector.

SimHub hands pressures over in the unit chosen in its own settings, rounded to two decimals. A
mapping's `unit_property` names the property that carries that unit, and the plugin converts back
into the catalog unit through the `local_units` table, sending an unknown unit empty. SimHub's
rounding sets the step: 0.01 bar is about 0.15 psi, so SimHub set to psi gives the finest pressure.

Damage, weather, the track's grip, electronics, energy and penalties come from
each game's own data where SimHub's generic data has nothing
([ADR 0039](adr/0039-per-game-telemetry-sources.md)): the mapping names a raw
property per game, and the plugin reads the one of `GameData.GameName` only while
the game runs, since SimHub keeps a closed game's last raw data. SimHub flattens raw arrays as
`CarDamage01`…, which its `/api/GetProperty/<name>` answers while a game runs.
ACC and AC were checked that way; iRacing and LMU follow SimHub's reader
structures and want a live session to confirm.

A field with no single property is computed in `Computed.cs` and the classes
beside it, named by the mapping's `computed` key: the gaps come from
SimHub's leaderboard, and so does the class position, the class position of the
player's row. Outside a race the gaps are best-lap differences, because SimHub's
race gaps mean nothing in practice.

The values the Lovely dashboard also shows follow it: read from where the Lovely
plugin reads them and worked out the way its dashboard works them out, so the
board agrees with it without depending on it. The position comes from SimHub's
leaderboard, the fuel time is SimHub's `Fuel_RemainingTime`, and the laps left in
a race over laps SimHub's `RemainingLaps` (iRacing's own count there). A lap is
invalid by each game's rule: ACC's and F1's own flags, AC EVO's SimHub flag, in
iRacing any moment off the track outside a race until the next lap starts, never
in AC, LMU, rF2, AMS2 and RaceRoom, and always in a game Lovely does not name. A
session runs on time by iRacing's own flag, by no lap count in LMU, rF2 and AMS2,
by time left in RaceRoom, and elsewhere while the time left is under a day. The
estimated lap time and the live delta are the tracker's session-best estimate,
else its all-time-best one, else the game's own delta, else the running lap, shown
as they come, including the nonsense in the pit lane; their colour grades them
against the personal best and the session's fastest lap, and the last lap's colour
does the same without ever reading invalid. The sector times and colours follow
Lovely's sector panel: the running sector live, the sectors still to come from the
last lap, the whole last lap for five seconds after the line, purple at or under
the session's best split, and LMU's sectors from its own scoring. Fuel to finish,
to add and the pit call follow Lovely's dashboard, the fuel margin added to the
fuel to add, and the fuel level, consumption and fuel laps keep Lovely's decimals.
Brake bias adds iRacing's fine adjustment, the LMU engine map reads R, SC, OFF or
the hypercar power step, the hybrid modes read as names, DRS in iRacing comes from
its own status, and the session type is shown in capitals. The plugin's tyre,
pressure and brake averages take a sample every three seconds outside the pits,
keep as many as the chosen laps hold at the best lap over three seconds, and last
until SimHub restarts; LMU's tyre temperature blends the carcass and inner layers.
The laps left in a timed session run on the best lap, else the last lap clear of
the pit lane, else the all-time best. The Settings tab's fuel margin and averages start
from the defaults the mapping's `parameters` name.

## Buttons

The plugin adds `Button1` to `Button16` and `SwitchPosition1` to
`SwitchPosition12` to SimHub's actions — `PitrigPlugin.Button1` and so on under
**Controls and events** — and watches every input SimHub reports. The modules
document's `inputs` names the inputs behind each logical button and switch
position ([ADR 0038](adr/0038-pc-buttons-drive-the-board.md)); the plugin keeps
it from the last read of each board, and the wiring of several boards adds up.
A bit of `input.buttons` is set while a named input or an action is held, and a
press shorter than 60 ms still lasts 60 ms on the board. SimHub fires an action
from an event or its web API without a release, so an action counts as held
only while some input is down, and as a tap otherwise. `input.switch` keeps the
last position pressed. A dashboard with `controls` is sent both, and
`session.time_elapsed`.

## The configurator link

UDP on the ports of `profile.link` in `telemetry/simhub_generic_mappings.json`:
the configurator listens on 45455, the plugin on 45456. Every datagram starts
with the same seven bytes:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 2 | `PT` |
| 2 | 1 | protocol version, `2` |
| 3 | 4 | sequence number, unsigned little-endian |

The configurator sends a request once a second and whenever it changes: lines
of `key=value`.

| Key | Meaning |
| --- | --- |
| `seq` | the request's own number, echoed by the plugin's `ack` |
| `fields` | wire ids to stream, comma-separated, or `*` |
| `hold` | a port the configurator holds or is opening; one line each |
| `release` | `<port>@<baud>:<wire ids>`, a board handed back, repeated for three seconds |
| `inputs` | `1` while the configurator wants every input change reported |
| `wiring` | `1` when the `button` and `position` lines are the wiring of the ports it holds |
| `button` | `<n>:<SimHub input>`, an input of logical button n; one line each |
| `position` | `<n>:<SimHub input>`, the input of switch position n |

`hold`, `release`, `inputs` and `wiring` count only from `127.0.0.1`. A port
missing from the latest request is free again, and so is every port after three
seconds of silence. A held port uses the request's wiring in place of the one
its board stores until it is handed back and read again.

The plugin answers with telemetry — at most 1200 bytes of whole `<id>;<value>`
lines, which the configurator forwards byte for byte — and once a second, or as
soon as a port is let go, with a status datagram: the line `@PT:STATUS`, then
`version`, `ack`, `boards` (`<port>@<baud>:<board>` each), `released` and `busy`.
While `inputs` is asked for, each input change sends `@PT:INPUT`, then
`input=<SimHub input>` or `action=<button>` with `down=1` or `0` (neither for a
switch action), `actions` and `buttons` as bitmasks, `switch`, and a
`pressed=<input>` line for each input still down. A receiver that reads a
version it does not know drops the datagram.

## Building

The project targets .NET Framework 4.8 and references `GameReaderCommon.dll`,
`SimHub.Plugins.dll`, `SimHub.Logging.dll` and `log4net.dll` from a SimHub
installation:

```powershell
cd simhub\plugin\Pitrig.SimHub
dotnet build -c Release -p:SimHubPath="C:\Program Files (x86)\SimHub"
```

CI builds it against SimHub 9.13.2, pinned by digest, with the configurator's
version. `TelemetryCatalog.g.cs` is generated with the rest of the catalog and is
never edited by hand:

```bash
python3 -m tools.codegen.telemetry_catalog
```

It carries every field's wire id, SimHub property, conversion, format and rate,
from `telemetry/simhub_generic_mappings.json`.

A Debug build, `dotnet build` without `-c Release`, is the development build: it
writes `Logs\Pitrig-trace.log` in the SimHub folder — each board's sessions,
requests and states, and every pause over half a second, whether SimHub sent no
update or a board took no data — and adds a Diagnostics tab to the plugin's page.
The Release build that CI and the installer use carries none of it
([ADR 0028](adr/0028-debug-build-and-debug-application-boundary.md)).
