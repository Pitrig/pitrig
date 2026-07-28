# SimHub Custom Serial Setup

SimCore accepts one ASCII telemetry field per line over the transport selected
by the board configuration. This is a SimHub **Custom Serial Device** protocol,
not the SimHub Arduino protocol.

## Serial settings

- Select the serial port exposed by the board. T-Display-S3 uses native USB CDC;
  Guition ESP32-4848S040 uses its onboard USB-to-UART bridge.
- Use `115200`, 8 data bits, no parity, and 1 stop bit.
- Enable automatic reconnect.
- Keep RTS and DTR disabled unless the board's flashing setup requires them.
- Every update message must include the explicit `\n` terminator.

Native USB CDC does not use the configured baud rate electrically. Guition's
UART transport does, so keep SimHub configured for 115200 baud.

## Line format

```text
R;<rpm>\n
S;<speed-kph>\n
G;<gear>\n
L;<current-lap-ms>\n
B;<best-lap-ms>\n
D;<signed-lap-delta-ms>\n
P;<estimated-lap-ms>\n
T;<traction-control-level>\n
A;<abs-level>\n
BB;<front-brake-bias-percent>\n
```

RPM, speed, and lap times are non-negative decimal integers. Gear is a signed
decimal integer; `N` is also accepted as neutral (`0`) and `R` as reverse
(`-1`). Lap delta is a signed integer in milliseconds: negative means faster,
positive means slower. `D;` marks lap delta as unavailable, and `P;` marks
estimated lap time as unavailable. Traction-control and ABS levels are integers
from 0 through 255. Front brake bias is a percentage from `0` through `100`
with zero or one fractional digit, for example `BB;54.0`. Empty `T;`, `A;`, or
`BB;` messages mark those values as unavailable. Unknown line identifiers and
malformed lines are ignored.

## Example update messages

Add each row as a separate update message in SimHub Custom Serial. The formulas
below use NCalc. Use SimHub's **Insert property** picker to confirm the property
name for the installed game/plugin, because not every game exposes every lap
property.

| Telemetry | NCalc message template | Recommended maximum rate |
| --- | --- | --- |
| RPM | `'R;' + format([DataCorePlugin.GameData.NewData.Rpms], '0') + '\n'` | 20 Hz |
| Speed | `'S;' + format([DataCorePlugin.GameData.NewData.SpeedKmh], '0') + '\n'` | 10 Hz |
| Gear | `'G;' + isnull([DataCorePlugin.GameData.NewData.Gear], 'N') + '\n'` | Changes only |
| Current lap | `'L;' + format(timespantoseconds([DataCorePlugin.GameData.NewData.CurrentLapTime]) * 1000, '0') + '\n'` | 10 Hz |
| Best lap | `'B;' + format(timespantoseconds([DataCorePlugin.GameData.NewData.BestLapTime]) * 1000, '0') + '\n'` | Changes only |
| Lap delta | Prefix the signed delta property selected in SimHub with `D;`, convert seconds to milliseconds if required, and append `\n` | 10 Hz |
| Estimated lap | Prefix the estimated lap-time property selected in SimHub with `P;`, convert it to milliseconds if required, and append `\n` | 10 Hz |
| Traction control | Prefix the integer traction-control level selected in SimHub with `T;` and append `\n` | Changes only |
| ABS | Prefix the integer ABS level selected in SimHub with `A;` and append `\n` | Changes only |
| Front brake bias | Prefix the front brake-bias percentage selected in SimHub with `BB;`, format it with at most one decimal digit, and append `\n` | Changes only |

SimHub's free mode limits output to 10 Hz, so use 10 Hz for RPM as well when
that limit applies. If a lap-time property can be absent for a particular game,
configure the message to return an empty string in that case; SimHub does not
send empty update messages.

The exact lap-delta and estimated-lap property names vary between games and
SimHub plugins. Use SimHub's property picker and configure unavailable branches
to emit `D;\n` or `P;\n` instead of omitting the update, so the firmware can
clear stale values.
