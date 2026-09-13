# SimHub plugin

The Pitrig plugin reads the telemetry catalog inside SimHub and sends it to the
configurator, which forwards it to the board and draws it in the preview
([ADR 0034](adr/0034-configurator-telemetry-bridge.md)). It replaces the Custom
Serial profile, which stays supported for a board fed straight from SimHub
([SimHub telemetry](simhub-custom-serial.md)).

For now both halves are development-only: the plugin is not distributed, and
only a development build of the configurator (`pnpm run dev`) carries the
bridge and its **Live telemetry** panel. The packaged configurator feeds a
board through the Custom Serial profile.

## Installing

Copy `Pitrig.SimHub.dll` next to `SimHub.exe` and restart SimHub. The plugin
appears in the left menu as **Pitrig**; the panel shows the addresses of the
machine it runs on, takes the port it listens on and switches sending on and
off.

On the configurator's Protocol page, **Live telemetry** takes the SimHub
machine's address and starts the bridge. The defaults pair without editing
anything: `127.0.0.1`, plugin port 45456, listen port 45455. SimHub on another
machine needs one of the addresses the plugin panel shows typed into **SimHub
machine**; on macOS the configurator also has to be allowed under Privacy &
Security → Local Network.

## Building

The project targets .NET Framework 4.8 and references `GameReaderCommon.dll`
and `SimHub.Plugins.dll` from the SimHub installation, so it builds on the
machine SimHub is installed on and is not part of CI:

```powershell
cd simhub\plugin\Pitrig.SimHub
dotnet build -c Release -p:SimHubPath="C:\Program Files (x86)\SimHub"
```

`TelemetryCatalog.g.cs` is generated with the rest of the catalog and is never
edited by hand:

```bash
python3 -m tools.codegen.telemetry_catalog
```

It carries every field's wire identifier, the SimHub property behind it, the
conversion, the format and the rate, from the same
`telemetry/simhub_generic_mappings.json` the Custom Serial profile is built
from. Twenty-one fields have no single property and are computed in `Computed.cs`;
each names its native twin through the mapping's `computed` key, so a change to
one side is a visible change to the other.

A mapping's `unavailable_when` names the values a game uses to mean nothing — an
`EngineMap` of −1, a water temperature of 0 — and both sides send them empty, so
the board draws the widget's `unavailable_text`. A `uint32` field refuses a
negative value the same way, because the board cannot parse one. The live delta
itself is sent as the game reports it, and is empty only when the game reports
nothing; the fifth-of-a-lap bound survives where a delta feeds a computed time —
the estimated lap time and the sector delta — because a replay or a switched car
would otherwise produce a nonsensical clock. The sector delta keeps the live
delta at the last sector boundary and the gaps read the opponent list, neither
of which an expression can hold, so the Custom Serial profile sends the last
completed sector against the best lap and PersistantTracker's gap to the
neighbouring driver instead.

## The wire

The configurator asks first. It binds its listen port and sends a bare
seven-byte header to the plugin once a second; the plugin streams to whatever
address that request came from and forgets it after three seconds of silence.
Nothing but the machine the configurator names is heard, and a fresh subscriber
gets a keyframe immediately rather than waiting for the next one.

Telemetry travels as UDP datagrams. Each carries the same seven-byte header and
a payload of whole lines in the format the board already parses,
`<id>;<value>\n` ([SimHub telemetry](simhub-custom-serial.md)):

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 2 | `PT` |
| 2 | 1 | protocol version, `1` |
| 3 | 4 | sequence number, unsigned little-endian |

The payload is at most 1200 bytes and never splits a line, so the configurator
forwards it to the board byte for byte. The sequence number counts loss and
identifies a restarted sender; a receiver that reads a version it does not know
drops the datagram.

Each field is evaluated at its catalog rate — 60, 20 or 5 Hz, or 10 Hz for the
`changes` rate — and is sent only when its formatted value differs from the one
last sent. Every known value is repeated once a second, which is what a lost
datagram costs at worst. An unavailable field sends an empty value once, which
invalidates it on the board and in the preview.
