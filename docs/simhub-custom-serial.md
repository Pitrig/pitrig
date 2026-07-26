# SimHub Custom Serial Setup

SimCore currently accepts one ASCII telemetry field per line over native USB
CDC. This is a SimHub **Custom Serial Device** protocol, not the SimHub Arduino
protocol.

## Serial settings

- Select the serial port exposed by the ESP32-S3 USB CDC device.
- Use `115200`, 8 data bits, no parity, and 1 stop bit.
- Enable automatic reconnect.
- Keep RTS and DTR disabled unless the board's flashing setup requires them.
- Every update message must include the explicit `\n` terminator.

USB CDC does not use the configured baud rate electrically, but using 115200
keeps the host configuration conventional and portable.

## Line format

```text
R;<rpm>\n
S;<speed-kph>\n
G;<gear>\n
L;<current-lap-ms>\n
B;<best-lap-ms>\n
D;<signed-lap-delta-ms>\n
```

RPM, speed, and lap times are non-negative decimal integers. Gear is a signed
decimal integer; `N` is also accepted as neutral (`0`) and `R` as reverse
(`-1`). Lap delta is a signed integer in milliseconds: negative means faster,
positive means slower, and `D;` marks the value as unavailable. Unknown line
identifiers and malformed lines are ignored.

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

SimHub's free mode limits output to 10 Hz, so use 10 Hz for RPM as well when
that limit applies. If a lap-time property can be absent for a particular game,
configure the message to return an empty string in that case; SimHub does not
send empty update messages.

The exact lap-delta property name varies between games and SimHub plugins. Use
SimHub's property picker and configure the unavailable branch to emit `D;\n`
instead of omitting the update, so the firmware can clear a stale delta.
