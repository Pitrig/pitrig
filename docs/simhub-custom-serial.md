# SimHub Custom Serial telemetry

Pitrig accepts newline-delimited telemetry over the board-selected serial
transport.

## Generating or downloading a SimHub profile

The desktop configurator's **SimHub profile** panel provides two export modes:

- **Dashboard only** includes every binding the dashboard reads: the sources a
  text widget composes, the source a gauge maps, and the field a styling rule
  watches even when the widget never shows it. Duplicate bindings are emitted
  once.
- **All telemetry** includes the complete 227-field catalog.

The export uses the current configuration draft. Its explicit
`telemetry_transport.uart.baud_rate` is used when present; otherwise the baud
rate is 921600. A Guition ESP32-4848S040 draft carries `460800` explicitly, so
its export already matches the board and the checked-in complete profile does
not. A dashboard-only export is blocked when the draft contains an
unknown telemetry binding or requires no telemetry.

As an alternative, download the checked-in complete
[`simhub/Pitrig-telemetry.shsds`](../simhub/Pitrig-telemetry.shsds). It uses
921600 baud and enables all 227 fields. Both forms enable automatic reconnect
and disable RTS and DTR.

Import the resulting file from the Custom Serial Devices plugin's **Import
settings** action, then select the Pitrig serial port.

Devices that already have a saved UART configuration may retain the previous
115200 baud value. Set `telemetry_transport.uart.baud_rate` to `921600` in the
device configuration before connecting the generated profile — or to `460800`
on a Guition ESP32-4848S040, whose bridge does not hold `921600`.

Update frequencies follow the catalog metadata:

- `fast`: 60 Hz;
- `normal`: 20 Hz;
- `slow`: 5 Hz;
- `changes`: changes only.

The checked-in complete profile and the configurator's profile data are
regenerated together with the catalog:

```bash
python3 -m tools.codegen.telemetry_catalog
```

Generic property expressions are maintained in
`telemetry/simhub_generic_mappings.json`. An unsupported SimHub property sends
an empty value, which marks only that canonical field unavailable. The profile
does not contain game-specific raw-data mappings. SimHub Free limits update
messages to 10 Hz, regardless of higher values stored in the profile;
`dashboard.smoothing` ([dashboard-widgets.md](dashboard-widgets.md#screens-and-widgets))
is what makes a feed that slow move between its packets.

Each line contains a one- or two-character field identifier, a semicolon, and
a value. The complete generated ID table is in the
[telemetry catalog](telemetry-catalog.md). The original identifiers remain
compatible:

```text
R;<rpm text>
S;<speed text>
G;<gear text>
L;<current lap milliseconds>
B;<best lap milliseconds>
D;<signed delta milliseconds>
P;<estimated lap milliseconds>
T;<traction-control level text>
A;<ABS level text>
BB;<brake-bias text>
F;<fuel text>
FC;<average-consumption text>
FL;<remaining-laps text>
```

The value after the first semicolon is stored as bounded source text and, for
typed fields, also decoded to its numeric value. Text widgets may preserve the
source text or apply a configured transform:

```text
R;7342
S;182 km/h
G;4
L;63231
B;61923
D;-237
P;62615
T;3
A;2
BB;54.0%
F;38 L
FC;AVG 2.6
FL;LAPS 14.7
```

Typed catalog fields accept unsigned base-10 integers, signed base-10 integers,
decimal floats, or booleans (`0`, `1`, `false`, or `true`) according to their
declared type. Their original strings are still retained, while `duration_ms`
and `signed_duration_ms` time transforms use typed millisecond values. The Lap
Timer module consumes `L` and exposes its smoothly extrapolated `current_time`
output separately from the raw telemetry slot.

The identifier-to-field mapping remains private to the SimHub protocol. During
startup, every identifier is resolved to a protocol-neutral telemetry handle,
such as `engine.rpm` or `session.lap.delta`. Modules and widgets never consume
SimHub identifiers directly.

An empty value invalidates the field:

```text
P;
F;
```

Unknown identifiers, invalid typed values, overlong values, and overlong lines
are ignored. A stored value may use at most 63 UTF-8 bytes; a complete line may
use at most 127 bytes before the newline.

The catalog's rate column is a transmission recommendation, not a requirement
to send every field. Send only fields used by the active dashboard or modules,
at a rate appropriate for that field, to keep serial bandwidth bounded.

Pitrig provides generic SimHub property expressions but no game-specific
source mappings. The `game_specific` availability label warns that a canonical
field is not exposed by every simulation.

Configuration control frames begin with `@PR:` and share the same serial
connection. The configuration router consumes those frames before telemetry,
so they are never interpreted as telemetry values. Three namespaces under that
prefix open a binary upload session instead of answering a line — `@PR:FONT:`
([Font asset storage](font-assets.md)), `@PR:IMAGE:`
([Image asset storage](image-assets.md)) and `@PR:FW:`
([Firmware updates over serial](ota.md)) — and only one of them may own the link
at a time.

The configuration commands themselves name the document they act on:
`@PR:GET:dashboard`, `@PR:SET:protocol:<JSON>` and so on, over the three
documents a board stores. The full command table is in
[Control commands](control-protocol.md#control-commands).

## Streaming through the configurator

A board carries one serial link, so SimHub and the configurator cannot both hold
it. The configurator's **Live telemetry** panel on the Protocol page takes the
stream instead and forwards it to the board unchanged, which leaves the
dashboard preview, the lamp preview and the catalog showing live values while
the board keeps its feed. Saving and live apply keep working: the bridge stops
writing while a `@PR:` command owns the link and resumes at the next line
boundary (ADR 0034).

The configurator has to own a serial port for this, and how it gets one depends
on the platform.

- **macOS** — it creates the port itself and shows the path. Point the telemetry
  source at that path. Open it at 230400 baud or lower: a hosted port has no
  wire, and macOS refuses the faster rates.
- **Windows** — an application cannot create a serial port. Install a virtual
  pair such as com0com once, point the Custom Serial Device at one half, and
  choose the other half in the panel.
- **Linux** — pair a port with the source, a pty or any adapter, and choose the
  half the source does not hold.

The panel measures what the detour costs: what the bridge adds before the write
to the board, what the write itself takes, and the line, field and byte rates
with dropped bytes and write errors beside them.

With no board connected the bridge still runs and drives the previews alone,
which is how a dashboard is authored away from the car.

## One link per board

A board carries exactly one serial link, the one its `protocol` document
selects. The ESP32-P4 build once attached a second link on the USB-Serial-JTAG
port as a development aid; that is gone, and the P4's native USB CDC port is
now its only link. Flashing and the ESP console still use the USB-Serial-JTAG
port, which the application no longer touches.

Only one upload may own the binary stream at a time; a `BEGIN`, `INFO` or
`CLEAR` for either asset kind that finds it claimed — by startup, which is still
reading the partitions, or by an upload not yet torn down — is answered `busy`.
