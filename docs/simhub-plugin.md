# SimHub plugin

The Pitrig plugin runs inside SimHub, finds the Pitrig boards connected to the PC
and sends each one the telemetry its documents bind
([ADR 0035](adr/0035-simhub-plugin-feeds-the-board.md)). While the configurator
is connected to a board it takes the board over and passes the plugin's stream on
([ADR 0034](adr/0034-configurator-telemetry-bridge.md)). The Custom Serial
profile still feeds a board without the plugin
([SimHub telemetry](simhub-custom-serial.md)); do not leave a Custom Serial device
on the same port, because whichever opens it first keeps it.

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
and sends the fields they bind, at the catalog rates, changed values only, with
every value repeated within a second. A board in safe mode is shown and left
alone. The panel lists each board, what it is sent and how many bytes a second,
the shift-light source of the current car, and what the plugin costs SimHub per
update.

## Shift lights

`engine.shift_progress` and `engine.shift_now`
([ADR 0036](adr/0036-per-car-shift-lights.md)) come from the first source that
answers:

| Game | Source |
| --- | --- |
| iRacing | `GameRawData.Telemetry.PlayerCarSL{First,Last,Shift}RPM` for the current gear, else `GameRawData.SessionData.DriverInfo.DriverCarSL…RPM` for the car |
| F1 | `GameRawData.PlayerCarTelemetryData.m_revLightsPercent` |
| RaceRoom | `GameRawData.UpshiftRps`, in radians a second |
| Any | `CarSettings_CurrentGearRedLineRPM` from SimHub's car settings, the bar starting at 85 % of it |
| Any | 97 % of `MaxRpm` |

The raw paths are the ones SimHub publishes; check them in SimHub's property
list, with game-specific properties shown, when a game misbehaves.

## Values

A mapping's `unavailable_when` names the values a game uses to mean nothing — an
`EngineMap` of −1, a water temperature of 0 — and both paths send them empty, so
the board draws the widget's `unavailable_text`. A `uint32` field refuses a
negative value the same way. The live delta is sent as the game reports it; the
fifth-of-a-lap bound survives where a delta feeds a computed time — the estimated
lap time and the sector delta. The sector delta keeps the live delta at the last
sector boundary and the gaps read the opponent list, neither of which an
expression can hold, so the Custom Serial profile sends the last completed sector
against the best lap and PersistantTracker's gap to the neighbouring driver
instead.

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

`hold` and `release` count only from `127.0.0.1`. A port missing from the latest
request is free again, and so is every port after three seconds of silence.

The plugin answers with telemetry — at most 1200 bytes of whole `<id>;<value>`
lines, which the configurator forwards byte for byte — and once a second, or as
soon as a port is let go, with a status datagram: the line `@PT:STATUS`, then
`version`, `ack`, `boards` (`<port>@<baud>:<board>` each), `released` and `busy`.
A receiver that reads a version it does not know drops the datagram.

## Building

The project targets .NET Framework 4.8 and references `GameReaderCommon.dll`,
`SimHub.Plugins.dll`, `SimHub.Logging.dll` and `log4net.dll` from a SimHub
installation:

```powershell
cd simhub\plugin\Pitrig.SimHub
dotnet build -c Release -p:SimHubPath="C:\Program Files (x86)\SimHub"
```

CI builds it against SimHub 9.13.2, pinned by digest, with the configurator's
version. `TelemetryCatalog.g.cs` is generated with the rest of the catalog
(`python3 -m tools.codegen.telemetry_catalog`) and carries every field's wire id,
SimHub property, conversion, format and rate; the 24 fields without a single
property are computed in `Computed.cs` and `ShiftLights.cs`, each named by its
mapping's `computed` key.
