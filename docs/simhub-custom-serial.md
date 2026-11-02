# SimHub Custom Serial telemetry

Pitrig accepts newline-delimited telemetry over the board-selected serial
transport, and the [SimHub plugin](simhub-plugin.md) writes it with nothing to
set up. Nothing else may hold a board's port: a SimHub Custom Serial device left
on it keeps the plugin out.

A board's UART runs at 921600 baud unless its `telemetry_transport.uart.baud_rate`
says otherwise; a Guition ESP32-4848S040 carries `460800`, because its bridge does
not hold `921600`. The plugin sends each field at its catalog rate: `fast` at
60 Hz, `normal` at 20 Hz, `slow` at 5 Hz, and `changes` when the value changes.
The SimHub property or plugin computation behind each field is in
`telemetry/simhub_generic_mappings.json`; an unsupported property sends an
empty value, which marks only that field unavailable.

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
declared type. A float may carry a sign, a `.` and an `e`/`E` exponent, must
have at least one digit in its mantissa and one in any exponent, must be
consumed entirely and must be finite; `0x` forms, `inf` and `nan` are rejected,
as is anything longer than 31 characters. Their original strings are still
retained, while `duration_ms` and `signed_duration_ms` time transforms use typed
millisecond values. The Lap Timer module consumes `L` and exposes its smoothly
extrapolated `current_time` output separately from the raw telemetry slot.

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

The `game_specific` availability label warns that a canonical field is not
exposed by every simulation.

`session.gap_ahead`, `session.gap_behind` and `session.gap_leader` are unsigned
gaps in seconds to the cars one race position ahead and behind and to the
leader, and `session.class_position` and `session.starting_grid_position` come
from SimHub's leaderboard too. They stay empty until SimHub sees the other cars;
Assetto Corsa shares them only through the CrewChief app enabled in the game.

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


## One link per board

A board carries exactly one serial link, the one its `protocol` document
selects. The ESP32-P4 build once attached a second link on the USB-Serial-JTAG
port as a development aid; that is gone, and the P4's native USB CDC port is
now its only link. Flashing and the ESP console still use the USB-Serial-JTAG
port, which the application no longer touches.

Only one upload may own the binary stream at a time; a `BEGIN`, `INFO` or
`CLEAR` for either asset kind that finds it claimed — by startup, which is still
reading the partitions, or by an upload not yet torn down — is answered `busy`.
