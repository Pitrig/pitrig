# SimHub Custom Serial Protocol

SimCore receives telemetry from SimHub as newline-terminated ASCII messages over
the ESP32-S3 native USB CDC port. This is a SimHub **Custom Serial Device**
protocol, not the SimHub Arduino protocol.

Each message carries exactly one telemetry field:

```text
<field-id>;<decimal-value>\n
```

For example:

```text
R;7421
D;-183
P;92340
```

## Protocol reference

Add every row below as a separate SimHub update message. The property names are
the recommended SimHub mappings used by SimCore. Use SimHub's **Insert
property** picker to confirm that a property is available for the active game.

| ID | Value received by SimCore | Unit and accepted format | Firmware destination | Suggested SimHub property | SimHub NCalc message | Recommended rate |
| --- | --- | --- | --- | --- | --- | --- |
| `R` | Engine RPM | Non-negative integer, rpm | `TelemetrySnapshot.values.rpm` | `[DataCorePlugin.GameData.NewData.Rpms]` | `'R;' + format(isnull([DataCorePlugin.GameData.NewData.Rpms], 0), '0') + '\n'` | 20 Hz |
| `S` | Vehicle speed | Non-negative integer, km/h | `TelemetrySnapshot.values.speed_kph` | `[DataCorePlugin.GameData.NewData.SpeedKmh]` | `'S;' + format(isnull([DataCorePlugin.GameData.NewData.SpeedKmh], 0), '0') + '\n'` | 10 Hz |
| `G` | Current gear | Integer; `R` = `-1`, `N` = `0` | `TelemetrySnapshot.values.gear` | `[DataCorePlugin.GameData.NewData.Gear]` | `'G;' + isnull([DataCorePlugin.GameData.NewData.Gear], 'N') + '\n'` | Changes only |
| `L` | Current lap time | Non-negative integer, milliseconds | `TelemetrySnapshot.values.lap_time_current_ms` → Lap Timer module | `[DataCorePlugin.GameData.NewData.CurrentLapTime]` | `'L;' + format(if(isnull([DataCorePlugin.GameData.NewData.CurrentLapTime]), 0, timespantoseconds([DataCorePlugin.GameData.NewData.CurrentLapTime]) * 1000), '0') + '\n'` | 10 Hz |
| `B` | Best lap time | Non-negative integer, milliseconds | `TelemetrySnapshot.values.lap_time_best_ms` | `[DataCorePlugin.GameData.NewData.BestLapTime]` | `'B;' + format(if(isnull([DataCorePlugin.GameData.NewData.BestLapTime]), 0, timespantoseconds([DataCorePlugin.GameData.NewData.BestLapTime]) * 1000), '0') + '\n'` | Changes only |
| `D` | Live delta to session-best lap | Signed integer, milliseconds; negative = faster, positive = slower | `TelemetrySnapshot.values.lap_delta_ms` → Delta Time module | `[PersistantTrackerPlugin.SessionBestLiveDeltaSeconds]` | `'D;' + format(isnull([PersistantTrackerPlugin.SessionBestLiveDeltaSeconds], 0) * 1000, '0') + '\n'` | 10 Hz |
| `P` | Estimated lap time | Non-negative integer, milliseconds | `TelemetrySnapshot.values.lap_time_estimated_ms` → Estimated Lap Time module | `[PersistantTrackerPlugin.EstimatedLapTime]` | `'P;' + format(if(isnull([PersistantTrackerPlugin.EstimatedLapTime]), 0, timespantoseconds([PersistantTrackerPlugin.EstimatedLapTime]) * 1000), '0') + '\n'` | 10 Hz |

`D` is signed. These two messages therefore have different meanings:

```text
D;-183
D;292
```

The first means the driver is `0.183 s` faster. The second means the driver is
`0.292 s` slower.

## Unavailable values

Delta and estimated lap time support explicit invalidation:

```text
D;
P;
```

After receiving an empty `D` or `P` line, SimCore clears the corresponding
field's validity. The module then hides its value or displays its configured
placeholder.

The simple formulas in the table use `0` when a SimHub property is unavailable.
If explicit invalidation is preferred, use these formulas instead:

```text
if(isnull([PersistantTrackerPlugin.SessionBestLiveDeltaSeconds]),
   'D;\n',
   'D;' + format([PersistantTrackerPlugin.SessionBestLiveDeltaSeconds] * 1000, '0') + '\n')
```

```text
if(isnull([PersistantTrackerPlugin.EstimatedLapTime]),
   'P;\n',
   'P;' + format(timespantoseconds([PersistantTrackerPlugin.EstimatedLapTime]) * 1000, '0') + '\n')
```

Unknown identifiers, malformed values, and lines longer than 31 characters are
ignored without changing the current telemetry snapshot.

## SimHub setup

### 1. Enable Custom Serial Devices

1. Open SimHub.
2. Open **Settings → Plugins** (or **Add/remove features**, depending on the
   SimHub version).
3. Enable **Custom Serial Devices**.
4. Open **Custom Serial Devices** from the SimHub sidebar.

SimHub's official Custom Serial documentation is available in the
[SimHub wiki](https://github.com/SHWotever/SimHub/wiki/Custom-serial-devices).

### 2. Connect SimCore

1. Flash and start SimCore on the ESP32-S3.
2. Connect its native USB port to the PC.
3. Select the COM port exposed by the ESP32-S3 USB CDC device.
4. Enable **Automatic reconnect**.

Use these conventional serial settings:

| Setting | Value |
| --- | --- |
| Baud rate | `115200` |
| Data bits | `8` |
| Parity | None |
| Stop bits | `1` |
| RTS | Disabled |
| DTR | Disabled unless required by the board's reset/flashing setup |

USB CDC does not use the configured baud rate electrically, but `115200` keeps
the host configuration conventional and portable.

### 3. Add update messages

For every required telemetry field:

1. Add a new update message.
2. Select **NCalc** as the formula engine.
3. Copy the corresponding formula from the protocol table.
4. Select the recommended update rate.
5. Enable the message.

Each formula must include its field identifier, semicolon, integer value, and
the final `\n`. SimHub does not add terminators automatically.

The free SimHub edition limits output to 10 Hz. When that limit applies, set RPM
to 10 Hz as well.

### 4. Verify properties

Start a supported game and enter an active session before checking lap-related
properties. In SimHub:

1. Open the formula editor.
2. Use **Insert property**.
3. Search for the property listed in the table.
4. Confirm that the live preview contains a value.
5. Confirm that the final message preview looks like `X;<integer>` and does not
   contain a time string, decimal separator, `null`, `NaN`, or units.

Persistant Tracker properties may be unavailable until SimHub has enough valid
lap data to build its reference lap.

## Troubleshooting

### `Input string was not in a correct format`

SimCore expects decimal integers after the semicolon. Do not send a SimHub
`TimeSpan` directly:

```text
P;00:01:32.340
```

Convert it to seconds, multiply by `1000`, and format it without decimals:

```text
format(timespantoseconds([property]) * 1000, '0')
```

The valid result is:

```text
P;92340
```

### Only zeros arrive

- Start the game and enter an active timed session.
- Inspect the source property in SimHub's property picker.
- For Persistant Tracker values, complete at least one valid reference lap.
- Ensure `timespantoseconds(...)` is used only for time-span properties.
- Do not use `timespantoseconds(...)` for
  `SessionBestLiveDeltaSeconds`; that property is already expressed in seconds.

### Delta is tens of seconds instead of tenths

Inspect `[PersistantTrackerPlugin.SessionBestLiveDeltaSeconds]` directly. SimCore
does not rescale received `D` values: `D;-18340` means exactly `-18.340 s`.

The serial expression must multiply seconds by `1000` exactly once:

```text
'D;' + format([PersistantTrackerPlugin.SessionBestLiveDeltaSeconds] * 1000, '0') + '\n'
```

### Messages are ignored

Check that:

- the identifier is uppercase;
- the second character is `;`;
- the value contains only an optional sign and decimal digits;
- every message ends with `\n`;
- the complete line is no longer than 31 characters;
- the selected COM port belongs to the SimCore USB CDC device.
