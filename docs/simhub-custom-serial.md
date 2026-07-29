# SimHub Custom Serial telemetry

SimCore accepts newline-delimited telemetry over the board-selected serial
transport.

Each line contains a field identifier, a semicolon, and a value:

```text
R;<rpm text>
S;<speed text>
G;<gear text>
L;<current lap milliseconds>
B;<best lap text>
D;<signed delta milliseconds>
P;<estimated lap text>
T;<traction-control text>
A;<ABS text>
BB;<brake-bias text>
F;<fuel text>
FC;<average-consumption text>
FL;<remaining-laps text>
```

The value after the first semicolon is stored as an exact bounded UTF-8 string.
The firmware does not add units, prefixes, suffixes, or decimal formatting for
text widgets. Configure the desired presentation in SimHub:

```text
R;7342
S;182 km/h
G;4
P;01:42.615
T;3
A;2
BB;54.0%
F;38 L
FC;AVG 2.6
FL;LAPS 14.7
```

`L` and `D` are the only fields with an additional numeric contract. They must
contain base-10 integer milliseconds because the Lap Timer and Delta Time
modules use their numeric values. Their original strings are still retained for
optional text bindings.

The identifier-to-field mapping remains private to the SimHub protocol. During
startup, every identifier is resolved to a protocol-neutral telemetry handle,
such as `engine.rpm` or `session.lap.delta`. Modules and widgets never consume
SimHub identifiers directly.

An empty value invalidates the field:

```text
P;
F;
```

Unknown identifiers, invalid `L`/`D` numbers, overlong values, and overlong
lines are ignored. A stored value may use at most 47 UTF-8 bytes; a complete
line may use at most 63 bytes before the newline.

Configuration control frames begin with `@SC:` and share the same serial
connection. The configuration router consumes those frames before telemetry,
so they are never interpreted as telemetry values.
