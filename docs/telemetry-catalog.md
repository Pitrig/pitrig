# Telemetry catalog

This file is generated from `telemetry/telemetry_catalog.json`. It documents the bounded, protocol-neutral fields accepted by Pitrig. It does not define SimHub property formulas or game-specific source mappings.

Catalog version: 1. Fields: 263. Static limit: 350.

Games lists which of the games the SimHub plugin reads per game send a field; `any` is every game SimHub reports it for.

## Speed and controls

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `vehicle.speed` | `S` | `text` | `source` | `fast` | `common` | any | Vehicle speed formatted by the telemetry source. |
| `vehicle.throttle` | `00` | `float32` | `percent` | `fast` | `common` | any | Throttle pedal position. |
| `vehicle.brake` | `01` | `float32` | `percent` | `fast` | `common` | any | Brake pedal position. |
| `vehicle.clutch` | `02` | `float32` | `percent` | `fast` | `common` | any | Clutch pedal position. |
| `vehicle.handbrake` | `03` | `float32` | `percent` | `fast` | `optional` | any | Handbrake position. |
| `vehicle.steering` | `04` | `float32` | `normalized` | `fast` | `game_specific` | ACC, AC, LMU | Normalized steering position. |
| `vehicle.steering_angle` | `05` | `float32` | `degree` | `fast` | `game_specific` | iRacing | Steering wheel angle. |
| `vehicle.brake_bias` | `BB` | `text` | `source` | `normal` | `optional` | ACC, AC, iRacing, LMU | Front-to-rear brake bias, with iRacing's fine adjustment added, formatted by the telemetry source. |
## Engine

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `engine.rpm` | `R` | `text` | `source` | `fast` | `common` | any | Engine speed formatted by the telemetry source. |
| `engine.max_rpm` | `06` | `float32` | `rpm` | `changes` | `common` | any | Maximum engine speed. |
| `engine.shift_rpm` | `07` | `float32` | `rpm` | `changes` | `optional` | any | Recommended shift engine speed. |
| `engine.rpm_percent` | `08` | `float32` | `percent` | `fast` | `computed` | any | Engine speed as a percentage of maximum RPM. |
| `engine.shift_percent` | `5y` | `float32` | `percent` | `fast` | `computed` | any | Engine speed as a percentage of the current gear's shift point. |
| `engine.shift_progress` | `SP` | `float32` | `percent` | `fast` | `computed` | any | How far the current gear has gone from the car's first shift light to its full shift-light bar. |
| `engine.redline_reached` | `5z` | `boolean` | `boolean` | `fast` | `computed` | any | Whether engine speed has reached the current gear's shift point. |
| `engine.running` | `09` | `boolean` | `boolean` | `normal` | `optional` | ACC, AC | Whether the engine is running. |
| `engine.ignition` | `0a` | `boolean` | `boolean` | `normal` | `optional` | ACC, AC | Whether ignition is enabled. |
| `engine.starter` | `0b` | `boolean` | `boolean` | `normal` | `game_specific` | ACC, LMU | Whether the starter is active. |
| `engine.water_temperature` | `0c` | `float32` | `celsius` | `slow` | `optional` | any | Engine coolant temperature. |
| `engine.oil_temperature` | `0d` | `float32` | `celsius` | `slow` | `optional` | any | Engine oil temperature. |
| `engine.oil_pressure` | `0e` | `float32` | `kilopascal` | `slow` | `optional` | any | Engine oil pressure. |
| `engine.turbo_pressure` | `0f` | `float32` | `kilopascal` | `fast` | `computed` | any | Turbocharger boost pressure. |
| `engine.turbo_level` | `0g` | `float32` | `percent` | `fast` | `optional` | any | Normalized turbocharger boost level. |
| `engine.torque` | `0h` | `float32` | `newton_meter` | `fast` | `game_specific` | any | Current engine torque. |
| `engine.power` | `0i` | `float32` | `kilowatt` | `fast` | `game_specific` | none | Current engine power. |
| `engine.map` | `0j` | `text` | `source` | `changes` | `optional` | ACC, LMU | Selected engine map; in LMU R, SC, OFF or the hypercar power step by car class. |
| `engine.damage` | `0k` | `float32` | `percent` | `slow` | `game_specific` | none | Engine damage level. |
## Transmission

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `transmission.gear` | `G` | `text` | `source` | `fast` | `common` | any | Current gear formatted by the telemetry source. |
| `transmission.gear_number` | `0l` | `int32` | `count` | `fast` | `common` | any | Current numeric gear. |
| `transmission.shifting` | `0m` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether a gear change is in progress. |
| `transmission.damage` | `0n` | `float32` | `percent` | `slow` | `game_specific` | none | Transmission damage level. |
## Laps and sectors

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `session.lap.current` | `0o` | `uint32` | `count` | `normal` | `common` | any | Current lap number. |
| `session.lap.total` | `0p` | `uint32` | `count` | `changes` | `common` | any | Total scheduled laps. |
| `session.lap.completed` | `0q` | `uint32` | `count` | `normal` | `common` | any | Completed lap count. |
| `session.lap.current_time` | `L` | `uint32` | `millisecond` | `normal` | `common` | any | Elapsed time on the current lap. |
| `session.lap.last_time` | `0r` | `uint32` | `millisecond` | `changes` | `common` | any | Previous lap time. |
| `session.lap.best_time` | `B` | `uint32` | `millisecond` | `changes` | `common` | any | Personal best lap time. |
| `session.lap.session_best_time` | `0s` | `uint32` | `millisecond` | `changes` | `computed` | any | Fastest lap of the session in the player's class. |
| `session.lap.all_time_best_time` | `60` | `uint32` | `millisecond` | `changes` | `optional` | any | All-time personal best lap SimHub has recorded for this car and track. |
| `session.lap.estimated_time` | `P` | `uint32` | `millisecond` | `normal` | `computed` | any | Estimated current lap time. |
| `session.lap.delta` | `D` | `int32` | `millisecond` | `normal` | `computed` | any | Current signed lap-time delta. |
| `session.lap.delta_best` | `0t` | `int32` | `millisecond` | `normal` | `computed` | any | Signed delta to the personal best lap. |
| `session.lap.delta_session_best` | `0u` | `int32` | `millisecond` | `normal` | `computed` | any | Signed estimated delta of the current lap to the fastest lap of the session in the player's class. |
| `session.lap.delta_all_time_best` | `61` | `int32` | `millisecond` | `normal` | `computed` | any | Signed live delta to the all-time personal best lap. |
| `session.lap.last_delta_best` | `LD` | `int32` | `millisecond` | `changes` | `computed` | any | Signed delta of the last lap to the personal best, 0 when the last lap set it. |
| `session.lap.delta_status` | `62` | `uint32` | `status` | `normal` | `computed` | any | Pace of the current lap from its estimate: 0 none, 1 slower than the personal best, 2 personal best, 3 at or under the session's fastest lap, 4 invalid lap. |
| `session.lap.last_status` | `63` | `uint32` | `status` | `changes` | `computed` | any | The last lap against the personal best and the session's fastest lap, coded like session.lap.delta_status and never invalid. |
| `session.lap.invalid` | `0v` | `boolean` | `boolean` | `normal` | `optional` | any | Whether the current lap counts as invalid, by each game's rule. |
| `session.lap.valid` | `0w` | `boolean` | `boolean` | `normal` | `optional` | any | Whether the current lap counts as valid, by each game's rule. |
| `session.sector.current` | `0x` | `uint32` | `count` | `normal` | `common` | any | Current sector number. |
| `session.sector.current_time` | `0y` | `uint32` | `millisecond` | `normal` | `computed` | any | Elapsed time in the current sector. |
| `session.sector.1_time` | `0z` | `uint32` | `millisecond` | `changes` | `optional` | any | Sector one: running in sector one, else this lap's, and the last lap's for five seconds after the line. |
| `session.sector.2_time` | `10` | `uint32` | `millisecond` | `changes` | `optional` | any | Sector two: the last lap's in sector one, running in sector two, else this lap's, and the last lap's for five seconds after the line. |
| `session.sector.3_time` | `11` | `uint32` | `millisecond` | `changes` | `optional` | any | Sector three: the last lap's until sector three, running there, and the last lap's for five seconds after the line. |
| `session.sector.1_best` | `12` | `uint32` | `millisecond` | `changes` | `computed` | any | Best sector one time. |
| `session.sector.2_best` | `13` | `uint32` | `millisecond` | `changes` | `computed` | any | Best sector two time. |
| `session.sector.3_best` | `14` | `uint32` | `millisecond` | `changes` | `computed` | any | Best sector three time. |
| `session.sector.1_status` | `64` | `uint32` | `status` | `normal` | `computed` | any | Sector one against the personal best and the session's best split, coded like session.lap.delta_status and never invalid; the last lap for five seconds after the line. |
| `session.sector.2_status` | `65` | `uint32` | `status` | `normal` | `computed` | any | Sector two against the personal best and the session's best split, coded like session.lap.delta_status and never invalid; the last lap for five seconds after the line. |
| `session.sector.3_status` | `66` | `uint32` | `status` | `changes` | `computed` | any | Sector three of the last lap against the personal best and the session's best split for five seconds after the line, else 0, coded like session.lap.delta_status and never invalid. |
| `session.sector.delta` | `15` | `int32` | `millisecond` | `normal` | `computed` | any | Signed time gained or lost so far in the current sector against the best lap. |
| `track.position_percent` | `16` | `float32` | `normalized` | `fast` | `common` | any | Vehicle position around the lap, from 0 to 1. |
## Session and position

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `session.type` | `17` | `text` | `source` | `changes` | `common` | any | Session type in capitals, such as PRACTICE, QUALIFY or RACE, and -- when the game names none. |
| `session.name` | `18` | `text` | `source` | `changes` | `game_specific` | none | Session name. |
| `session.phase` | `19` | `text` | `source` | `changes` | `game_specific` | none | Current session phase. |
| `session.position` | `1a` | `uint32` | `count` | `normal` | `common` | any | Position in SimHub's leaderboard. |
| `session.class_position` | `1b` | `uint32` | `count` | `normal` | `computed` | any | Class position of the player's row in SimHub's leaderboard. |
| `session.participants` | `1c` | `uint32` | `count` | `changes` | `common` | any | Participant count. |
| `session.class_participants` | `1d` | `uint32` | `count` | `changes` | `optional` | any | Participant count within the vehicle class. |
| `session.time_elapsed` | `1e` | `uint32` | `millisecond` | `normal` | `common` | any | Elapsed session time. |
| `session.time_remaining` | `1f` | `uint32` | `millisecond` | `normal` | `common` | any | Remaining session time. |
| `session.laps_remaining` | `1g` | `uint32` | `count` | `normal` | `computed` | any | Laps left: SimHub's count in a race over laps; in a timed session estimated from the best lap, else the last lap clear of the pit lane, else the all-time best. |
| `session.is_timed` | `1h` | `boolean` | `boolean` | `changes` | `computed` | any | Whether the session runs on time: iRacing's own flag, no lap count in LMU, rF2 and AMS2, else a time left under a day. |
| `session.finished` | `1i` | `boolean` | `boolean` | `changes` | `game_specific` | LMU | Whether the player has finished. |
| `session.checkered` | `1j` | `boolean` | `boolean` | `changes` | `computed` | any | Whether the checkered flag has been shown in this session. |
| `session.starting_grid_position` | `1k` | `uint32` | `count` | `changes` | `computed` | any | Starting grid position. |
| `session.gap_ahead` | `1l` | `text` | `source` | `normal` | `computed` | any | Gap in seconds to the car one position ahead: on track in a race, between best laps in other sessions. |
| `session.gap_behind` | `1m` | `text` | `source` | `normal` | `computed` | any | Gap in seconds to the car one position behind: on track in a race, between best laps in other sessions. |
| `session.gap_leader` | `1n` | `text` | `source` | `normal` | `computed` | any | Gap in seconds to the session leader: on track in a race, between best laps in other sessions. |
## Fuel and energy

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `vehicle.fuel.level` | `F` | `text` | `source` | `slow` | `common` | any | Fuel level with one decimal under 10 and whole units above. |
| `vehicle.fuel.percent` | `1o` | `float32` | `percent` | `slow` | `computed` | any | Fuel tank level percentage. |
| `vehicle.fuel.capacity` | `1p` | `float32` | `liter` | `changes` | `optional` | any | Fuel tank capacity. |
| `vehicle.fuel.average_consumption` | `FC` | `text` | `source` | `slow` | `computed` | any | Average fuel per lap with two decimals under 10, one under 100 and whole units above. |
| `vehicle.fuel.current_consumption` | `1q` | `float32` | `liter` | `slow` | `computed` | any | Fuel used on the current lap. |
| `vehicle.fuel.laps_remaining` | `FL` | `text` | `source` | `slow` | `computed` | any | Estimated fuel laps remaining with one decimal up to 10 and whole laps above. |
| `vehicle.fuel.time_remaining` | `1r` | `uint32` | `millisecond` | `slow` | `computed` | any | Driving time left on the fuel, as SimHub's fuel calculator gives it. |
| `vehicle.fuel.required_to_finish` | `1s` | `float32` | `liter` | `slow` | `computed` | any | Fuel to finish: the laps left, in a timed session the time left over the best lap or else the last one, times the fuel per lap. |
| `vehicle.fuel.to_add` | `1t` | `float32` | `liter` | `slow` | `computed` | any | Fuel to add: what finishing needs plus the fuel margin minus the fuel aboard, a full tank when that is more, 0 when nothing is needed. |
| `vehicle.fuel.at_finish` | `67` | `float32` | `liter` | `slow` | `computed` | any | Fuel left over at the finish, 0 when it will not last. |
| `vehicle.fuel.pit_now` | `68` | `boolean` | `boolean` | `normal` | `computed` | any | Whether to pit now: past 80 % of the lap with at most 1.1 laps of fuel, out of the pits, after the first lap. |
| `vehicle.fuel.last_lap_consumption` | `1u` | `float32` | `liter` | `changes` | `computed` | any | Fuel used on the previous lap. |
| `vehicle.energy.level` | `1v` | `float32` | `source` | `normal` | `optional` | AC | Remaining electrical energy. |
| `vehicle.energy.percent` | `1w` | `float32` | `percent` | `normal` | `optional` | AC, iRacing, LMU | Battery charge as a whole percentage, empty for a car without hybrid energy. |
| `vehicle.energy.virtual` | `VE` | `float32` | `percent` | `slow` | `game_specific` | LMU | Virtual energy left, as LMU reports it for the stint. |
| `vehicle.energy.deployment_mode` | `1x` | `text` | `source` | `changes` | `game_specific` | AC, iRacing | Hybrid deployment mode by name, such as BALANCED, empty for a car without hybrid energy. |
| `vehicle.energy.recovery_mode` | `1y` | `text` | `source` | `changes` | `game_specific` | AC | Energy recovery: DEP, BUI or OFF. |
| `vehicle.energy.laps_remaining` | `1z` | `float32` | `count` | `slow` | `game_specific` | none | Estimated laps remaining on electrical energy. |
## Electronics and vehicle state

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `vehicle.aids.traction_control_level` | `T` | `text` | `source` | `normal` | `optional` | ACC, AC, iRacing, LMU | Configured traction-control level. |
| `vehicle.aids.traction_control_cut` | `TC` | `text` | `source` | `changes` | `game_specific` | ACC, iRacing, LMU | Second traction-control setting: TC cut in ACC and LMU, the second TC knob in iRacing. |
| `vehicle.aids.traction_control_active` | `20` | `boolean` | `boolean` | `fast` | `optional` | ACC, AC, LMU | Whether traction control is intervening. |
| `vehicle.aids.abs_level` | `A` | `text` | `source` | `normal` | `optional` | ACC, AC, iRacing, LMU | Configured ABS level. |
| `vehicle.aids.abs_active` | `21` | `boolean` | `boolean` | `fast` | `optional` | ACC, AC, LMU | Whether ABS is intervening. |
| `vehicle.aids.stability_control` | `22` | `text` | `source` | `normal` | `game_specific` | none | Configured stability-control level. |
| `vehicle.pit_limiter.enabled` | `23` | `boolean` | `boolean` | `fast` | `common` | any | Whether the pit limiter is enabled. |
| `vehicle.in_pit_lane` | `24` | `boolean` | `boolean` | `normal` | `common` | any | Whether the vehicle is in the pit lane. |
| `vehicle.in_pit_box` | `25` | `boolean` | `boolean` | `normal` | `optional` | any | Whether the vehicle is stopped in its pit box. |
| `vehicle.pit_requested` | `26` | `boolean` | `boolean` | `changes` | `game_specific` | LMU | Whether a pit stop has been requested. |
| `vehicle.drs.available` | `27` | `boolean` | `boolean` | `normal` | `optional` | AC, iRacing | Whether DRS is available. |
| `vehicle.drs.active` | `28` | `boolean` | `boolean` | `fast` | `optional` | AC, iRacing | Whether DRS is active. |
| `vehicle.push_to_pass.available` | `29` | `boolean` | `boolean` | `normal` | `game_specific` | none | Whether push-to-pass is available. |
| `vehicle.push_to_pass.active` | `2a` | `boolean` | `boolean` | `fast` | `optional` | any | Whether push-to-pass is active. |
| `vehicle.headlights` | `2b` | `text` | `source` | `changes` | `game_specific` | ACC, LMU | Headlight state. |
| `vehicle.wipers` | `2c` | `text` | `source` | `changes` | `game_specific` | ACC | Wiper mode. |
| `vehicle.horn` | `2d` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether the horn is active. |
| `vehicle.speed_limiter` | `2e` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether a non-pit speed limiter is active. |
| `vehicle.damage.aero` | `2f` | `float32` | `percent` | `slow` | `game_specific` | ACC, AC, LMU | Aerodynamic damage level. |
| `vehicle.damage.front_grade` | `DF` | `text` | `source` | `slow` | `game_specific` | ACC, AC | Front bodywork damage as OK, LIT, MED or HVY. |
| `vehicle.damage.rear_grade` | `DB` | `text` | `source` | `slow` | `game_specific` | ACC, AC | Rear bodywork damage as OK, LIT, MED or HVY. |
| `vehicle.damage.left_grade` | `DL` | `text` | `source` | `slow` | `game_specific` | ACC, AC | Left bodywork damage as OK, LIT, MED or HVY. |
| `vehicle.damage.right_grade` | `DR` | `text` | `source` | `slow` | `game_specific` | ACC, AC | Right bodywork damage as OK, LIT, MED or HVY. |
| `vehicle.damage.repair_time` | `RT` | `uint32` | `millisecond` | `slow` | `game_specific` | ACC, AC | Estimated pit time to repair the bodywork. |
| `vehicle.damage.suspension` | `2g` | `float32` | `percent` | `slow` | `game_specific` | none | Overall suspension damage level. |
| `vehicle.damage.transmission` | `2h` | `float32` | `percent` | `slow` | `game_specific` | none | Overall transmission damage level. |
## Flags and messages

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `session.flag.current` | `2i` | `text` | `source` | `normal` | `common` | any | Current primary flag state. |
| `session.flag.green` | `2j` | `boolean` | `boolean` | `normal` | `common` | any | Whether a green flag is active. |
| `session.flag.yellow` | `2k` | `boolean` | `boolean` | `normal` | `common` | any | Whether a yellow flag is active. |
| `session.flag.blue` | `2l` | `boolean` | `boolean` | `normal` | `common` | any | Whether a blue flag is active. |
| `session.flag.white` | `2m` | `boolean` | `boolean` | `normal` | `optional` | any | Whether a white flag is active. |
| `session.flag.red` | `2n` | `boolean` | `boolean` | `normal` | `game_specific` | ACC, iRacing | Whether a red flag is active. |
| `session.flag.black` | `2o` | `boolean` | `boolean` | `normal` | `optional` | any | Whether a black flag is active. |
| `session.flag.checkered` | `2p` | `boolean` | `boolean` | `normal` | `common` | any | Whether a checkered flag is active. |
| `session.flag.black_white` | `2q` | `boolean` | `boolean` | `normal` | `game_specific` | none | Whether a black-and-white warning flag is active. |
| `session.flag.black_orange` | `2r` | `boolean` | `boolean` | `normal` | `optional` | any | Whether a black-and-orange mechanical flag is active. |
| `session.local_yellow` | `2s` | `boolean` | `boolean` | `normal` | `game_specific` | iRacing, LMU | Whether a local yellow is active. |
| `session.safety_car` | `2t` | `boolean` | `boolean` | `normal` | `game_specific` | iRacing, LMU | Whether the safety car is active. |
| `session.virtual_safety_car` | `2u` | `boolean` | `boolean` | `normal` | `game_specific` | none | Whether virtual safety car conditions are active. |
| `session.penalty.active` | `2v` | `boolean` | `boolean` | `normal` | `game_specific` | ACC, AC, iRacing, LMU | Whether the player has an active penalty. |
| `session.penalty.type` | `2w` | `text` | `source` | `changes` | `game_specific` | ACC | Active penalty type. |
| `session.penalty.time` | `2x` | `int32` | `millisecond` | `changes` | `game_specific` | ACC, AC | Penalty time. |
| `session.penalty.message` | `2y` | `text` | `source` | `changes` | `game_specific` | none | Penalty or race-control message. |
## Track and weather

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `track.name` | `2z` | `text` | `source` | `changes` | `common` | any | Track name. |
| `track.configuration` | `30` | `text` | `source` | `changes` | `optional` | any | Track configuration or layout. |
| `track.length` | `31` | `float32` | `meter` | `changes` | `common` | any | Track lap length. |
| `track.temperature` | `32` | `float32` | `celsius` | `slow` | `optional` | ACC, AC, iRacing, LMU | Track surface temperature. |
| `track.wetness` | `33` | `float32` | `percent` | `slow` | `game_specific` | ACC, iRacing, LMU | Track wetness level. |
| `track.condition` | `TK` | `text` | `source` | `slow` | `game_specific` | ACC, iRacing, LMU | Track condition in three letters, such as GRN, OPT, DMP or WET. |
| `environment.air_temperature` | `34` | `float32` | `celsius` | `slow` | `optional` | ACC, AC, iRacing, LMU | Ambient air temperature. |
| `environment.rain_level` | `35` | `float32` | `percent` | `slow` | `game_specific` | ACC, iRacing, LMU | Rain intensity. |
| `environment.wind_speed` | `36` | `float32` | `meter_per_second` | `slow` | `game_specific` | ACC, iRacing | Wind speed. |
| `environment.wind_direction` | `37` | `float32` | `degree` | `slow` | `game_specific` | ACC, iRacing | Wind direction. |
| `environment.time_of_day` | `38` | `text` | `source` | `slow` | `game_specific` | ACC, iRacing, LMU | Simulation time of day. |
| `environment.cloud_level` | `39` | `float32` | `percent` | `slow` | `game_specific` | iRacing, LMU | Cloud cover level. |
| `environment.forecast` | `3a` | `text` | `source` | `changes` | `game_specific` | ACC | Weather forecast. |
| `environment.forecast_30` | `F3` | `text` | `source` | `changes` | `game_specific` | ACC | Weather forecast in 30 minutes. |
## Motion and vehicle physics

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `motion.acceleration_longitudinal` | `3b` | `float32` | `meter_per_second_squared` | `fast` | `optional` | any | Longitudinal acceleration. |
| `motion.acceleration_lateral` | `3c` | `float32` | `meter_per_second_squared` | `fast` | `optional` | any | Lateral acceleration. |
| `motion.acceleration_vertical` | `3d` | `float32` | `meter_per_second_squared` | `fast` | `optional` | any | Vertical acceleration. |
| `motion.g_force_longitudinal` | `3e` | `float32` | `g` | `fast` | `optional` | any | Longitudinal G force. |
| `motion.g_force_lateral` | `3f` | `float32` | `g` | `fast` | `optional` | any | Lateral G force. |
| `motion.g_force_vertical` | `3g` | `float32` | `g` | `fast` | `optional` | any | Vertical G force. |
| `motion.pitch` | `3h` | `float32` | `degree` | `fast` | `optional` | any | Vehicle pitch angle. |
| `motion.roll` | `3i` | `float32` | `degree` | `fast` | `optional` | any | Vehicle roll angle. |
| `motion.yaw` | `3j` | `float32` | `degree` | `fast` | `optional` | any | Vehicle yaw angle. |
| `motion.slip_angle` | `3k` | `float32` | `degree` | `fast` | `computed` | any | Vehicle slip angle from the local velocity. |
| `motion.ffb_force` | `3l` | `float32` | `normalized` | `fast` | `game_specific` | ACC, AC, iRacing | Current force-feedback signal. |
## PC inputs

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `input.buttons` | `IB` | `uint32` | `bitmask` | `fast` | `computed` | any | Logical buttons held down, bit 0 being button 1. Set by the SimHub plugin from the PC inputs the modules document names and from its ButtonN actions; 0 when nothing is pressed. |
| `input.switch` | `IS` | `uint32` | `position` | `fast` | `computed` | any | Position of the multi-position switch, counted from 1, as the SimHub plugin reads it from the PC inputs the modules document names or its SwitchPositionN actions; 0 while no position is known. |
## Tyres

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `tyre.front_left.pressure` | `3m` | `float32` | `kilopascal` | `slow` | `optional` | any | Tyre pressure at the front-left wheel. |
| `tyre.front_right.pressure` | `3n` | `float32` | `kilopascal` | `slow` | `optional` | any | Tyre pressure at the front-right wheel. |
| `tyre.rear_left.pressure` | `3o` | `float32` | `kilopascal` | `slow` | `optional` | any | Tyre pressure at the rear-left wheel. |
| `tyre.rear_right.pressure` | `3p` | `float32` | `kilopascal` | `slow` | `optional` | any | Tyre pressure at the rear-right wheel. |
| `tyre.front_left.temperature` | `3q` | `float32` | `celsius` | `slow` | `optional` | LMU | Average tyre temperature at the front-left wheel; in LMU a blend of the carcass and inner layers. |
| `tyre.front_right.temperature` | `3r` | `float32` | `celsius` | `slow` | `optional` | LMU | Average tyre temperature at the front-right wheel; in LMU a blend of the carcass and inner layers. |
| `tyre.rear_left.temperature` | `3s` | `float32` | `celsius` | `slow` | `optional` | LMU | Average tyre temperature at the rear-left wheel; in LMU a blend of the carcass and inner layers. |
| `tyre.rear_right.temperature` | `3t` | `float32` | `celsius` | `slow` | `optional` | LMU | Average tyre temperature at the rear-right wheel; in LMU a blend of the carcass and inner layers. |
| `tyre.front_left.temperature_inner` | `3u` | `float32` | `celsius` | `slow` | `optional` | any | Inner tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature_inner` | `3v` | `float32` | `celsius` | `slow` | `optional` | any | Inner tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature_inner` | `3w` | `float32` | `celsius` | `slow` | `optional` | any | Inner tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature_inner` | `3x` | `float32` | `celsius` | `slow` | `optional` | any | Inner tyre temperature at the rear-right wheel. |
| `tyre.front_left.temperature_middle` | `3y` | `float32` | `celsius` | `slow` | `optional` | any | Middle tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature_middle` | `3z` | `float32` | `celsius` | `slow` | `optional` | any | Middle tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature_middle` | `40` | `float32` | `celsius` | `slow` | `optional` | any | Middle tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature_middle` | `41` | `float32` | `celsius` | `slow` | `optional` | any | Middle tyre temperature at the rear-right wheel. |
| `tyre.front_left.temperature_outer` | `42` | `float32` | `celsius` | `slow` | `optional` | any | Outer tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature_outer` | `43` | `float32` | `celsius` | `slow` | `optional` | any | Outer tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature_outer` | `44` | `float32` | `celsius` | `slow` | `optional` | any | Outer tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature_outer` | `45` | `float32` | `celsius` | `slow` | `optional` | any | Outer tyre temperature at the rear-right wheel. |
| `tyre.front_left.carcass_temperature` | `46` | `float32` | `celsius` | `slow` | `game_specific` | ACC, AC | Tyre carcass temperature at the front-left wheel. |
| `tyre.front_right.carcass_temperature` | `47` | `float32` | `celsius` | `slow` | `game_specific` | ACC, AC | Tyre carcass temperature at the front-right wheel. |
| `tyre.rear_left.carcass_temperature` | `48` | `float32` | `celsius` | `slow` | `game_specific` | ACC, AC | Tyre carcass temperature at the rear-left wheel. |
| `tyre.rear_right.carcass_temperature` | `49` | `float32` | `celsius` | `slow` | `game_specific` | ACC, AC | Tyre carcass temperature at the rear-right wheel. |
| `tyre.front_left.surface_temperature` | `4a` | `float32` | `celsius` | `slow` | `game_specific` | none | Tyre surface temperature at the front-left wheel. |
| `tyre.front_right.surface_temperature` | `4b` | `float32` | `celsius` | `slow` | `game_specific` | none | Tyre surface temperature at the front-right wheel. |
| `tyre.rear_left.surface_temperature` | `4c` | `float32` | `celsius` | `slow` | `game_specific` | none | Tyre surface temperature at the rear-left wheel. |
| `tyre.rear_right.surface_temperature` | `4d` | `float32` | `celsius` | `slow` | `game_specific` | none | Tyre surface temperature at the rear-right wheel. |
| `tyre.front_left.wear` | `4e` | `float32` | `percent` | `slow` | `optional` | any | Tyre wear at the front-left wheel. |
| `tyre.front_right.wear` | `4f` | `float32` | `percent` | `slow` | `optional` | any | Tyre wear at the front-right wheel. |
| `tyre.rear_left.wear` | `4g` | `float32` | `percent` | `slow` | `optional` | any | Tyre wear at the rear-left wheel. |
| `tyre.rear_right.wear` | `4h` | `float32` | `percent` | `slow` | `optional` | any | Tyre wear at the rear-right wheel. |
| `tyre.front_left.detached` | `4i` | `boolean` | `boolean` | `changes` | `game_specific` | LMU | Whether the front-left wheel is detached. |
| `tyre.front_right.detached` | `4j` | `boolean` | `boolean` | `changes` | `game_specific` | LMU | Whether the front-right wheel is detached. |
| `tyre.rear_left.detached` | `4k` | `boolean` | `boolean` | `changes` | `game_specific` | LMU | Whether the rear-left wheel is detached. |
| `tyre.rear_right.detached` | `4l` | `boolean` | `boolean` | `changes` | `game_specific` | LMU | Whether the rear-right wheel is detached. |
| `tyre.front_left.punctured` | `4m` | `boolean` | `boolean` | `normal` | `game_specific` | LMU | Whether the front-left tyre is punctured. |
| `tyre.front_right.punctured` | `4n` | `boolean` | `boolean` | `normal` | `game_specific` | LMU | Whether the front-right tyre is punctured. |
| `tyre.rear_left.punctured` | `4o` | `boolean` | `boolean` | `normal` | `game_specific` | LMU | Whether the rear-left tyre is punctured. |
| `tyre.rear_right.punctured` | `4p` | `boolean` | `boolean` | `normal` | `game_specific` | LMU | Whether the rear-right tyre is punctured. |
| `tyre.front_left.flat_spot` | `4q` | `float32` | `normalized` | `normal` | `game_specific` | none | Flat-spot level at the front-left tyre. |
| `tyre.front_right.flat_spot` | `4r` | `float32` | `normalized` | `normal` | `game_specific` | none | Flat-spot level at the front-right tyre. |
| `tyre.rear_left.flat_spot` | `4s` | `float32` | `normalized` | `normal` | `game_specific` | none | Flat-spot level at the rear-left tyre. |
| `tyre.rear_right.flat_spot` | `4t` | `float32` | `normalized` | `normal` | `game_specific` | none | Flat-spot level at the rear-right tyre. |
| `tyre.front_left.slip` | `4u` | `float32` | `normalized` | `fast` | `game_specific` | ACC, AC | Wheel slip at the front-left wheel. |
| `tyre.front_right.slip` | `4v` | `float32` | `normalized` | `fast` | `game_specific` | ACC, AC | Wheel slip at the front-right wheel. |
| `tyre.rear_left.slip` | `4w` | `float32` | `normalized` | `fast` | `game_specific` | ACC, AC | Wheel slip at the rear-left wheel. |
| `tyre.rear_right.slip` | `4x` | `float32` | `normalized` | `fast` | `game_specific` | ACC, AC | Wheel slip at the rear-right wheel. |
| `tyre.front_left.load` | `4y` | `float32` | `newton` | `fast` | `game_specific` | AC, LMU | Vertical tyre load at the front-left wheel. |
| `tyre.front_right.load` | `4z` | `float32` | `newton` | `fast` | `game_specific` | AC, LMU | Vertical tyre load at the front-right wheel. |
| `tyre.rear_left.load` | `50` | `float32` | `newton` | `fast` | `game_specific` | AC, LMU | Vertical tyre load at the rear-left wheel. |
| `tyre.rear_right.load` | `51` | `float32` | `newton` | `fast` | `game_specific` | AC, LMU | Vertical tyre load at the rear-right wheel. |
| `tyre.front_left.rotation_speed` | `52` | `float32` | `radian_per_second` | `fast` | `game_specific` | ACC, AC, LMU | Rotation speed of the front-left wheel. |
| `tyre.front_right.rotation_speed` | `53` | `float32` | `radian_per_second` | `fast` | `game_specific` | ACC, AC, LMU | Rotation speed of the front-right wheel. |
| `tyre.rear_left.rotation_speed` | `54` | `float32` | `radian_per_second` | `fast` | `game_specific` | ACC, AC, LMU | Rotation speed of the rear-left wheel. |
| `tyre.rear_right.rotation_speed` | `55` | `float32` | `radian_per_second` | `fast` | `game_specific` | ACC, AC, LMU | Rotation speed of the rear-right wheel. |
## Brakes and suspension

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `brake.front_left.temperature` | `56` | `float32` | `celsius` | `slow` | `optional` | any | Brake temperature at the front-left wheel. |
| `brake.front_right.temperature` | `57` | `float32` | `celsius` | `slow` | `optional` | any | Brake temperature at the front-right wheel. |
| `brake.rear_left.temperature` | `58` | `float32` | `celsius` | `slow` | `optional` | any | Brake temperature at the rear-left wheel. |
| `brake.rear_right.temperature` | `59` | `float32` | `celsius` | `slow` | `optional` | any | Brake temperature at the rear-right wheel. |
| `brake.front_left.pressure` | `5a` | `float32` | `kilopascal` | `fast` | `game_specific` | iRacing | Brake pressure at the front-left wheel. |
| `brake.front_right.pressure` | `5b` | `float32` | `kilopascal` | `fast` | `game_specific` | iRacing | Brake pressure at the front-right wheel. |
| `brake.rear_left.pressure` | `5c` | `float32` | `kilopascal` | `fast` | `game_specific` | iRacing | Brake pressure at the rear-left wheel. |
| `brake.rear_right.pressure` | `5d` | `float32` | `kilopascal` | `fast` | `game_specific` | iRacing | Brake pressure at the rear-right wheel. |
| `brake.front_left.wear` | `5e` | `float32` | `percent` | `slow` | `game_specific` | none | Brake wear at the front-left wheel. |
| `brake.front_right.wear` | `5f` | `float32` | `percent` | `slow` | `game_specific` | none | Brake wear at the front-right wheel. |
| `brake.rear_left.wear` | `5g` | `float32` | `percent` | `slow` | `game_specific` | none | Brake wear at the rear-left wheel. |
| `brake.rear_right.wear` | `5h` | `float32` | `percent` | `slow` | `game_specific` | none | Brake wear at the rear-right wheel. |
| `brake.front_left.abs_active` | `5i` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether ABS is active at the front-left wheel. |
| `brake.front_right.abs_active` | `5j` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether ABS is active at the front-right wheel. |
| `brake.rear_left.abs_active` | `5k` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether ABS is active at the rear-left wheel. |
| `brake.rear_right.abs_active` | `5l` | `boolean` | `boolean` | `fast` | `game_specific` | none | Whether ABS is active at the rear-right wheel. |
| `suspension.front_left.travel` | `5m` | `float32` | `millimeter` | `fast` | `game_specific` | ACC, AC, iRacing, LMU | Suspension travel at the front-left wheel. |
| `suspension.front_right.travel` | `5n` | `float32` | `millimeter` | `fast` | `game_specific` | ACC, AC, iRacing, LMU | Suspension travel at the front-right wheel. |
| `suspension.rear_left.travel` | `5o` | `float32` | `millimeter` | `fast` | `game_specific` | ACC, AC, iRacing, LMU | Suspension travel at the rear-left wheel. |
| `suspension.rear_right.travel` | `5p` | `float32` | `millimeter` | `fast` | `game_specific` | ACC, AC, iRacing, LMU | Suspension travel at the rear-right wheel. |
| `suspension.front_left.velocity` | `5q` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | iRacing | Suspension velocity at the front-left wheel. |
| `suspension.front_right.velocity` | `5r` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | iRacing | Suspension velocity at the front-right wheel. |
| `suspension.rear_left.velocity` | `5s` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | iRacing | Suspension velocity at the rear-left wheel. |
| `suspension.rear_right.velocity` | `5t` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | iRacing | Suspension velocity at the rear-right wheel. |
| `suspension.front_left.damage` | `5u` | `float32` | `percent` | `slow` | `game_specific` | ACC | Suspension damage at the front-left wheel. |
| `suspension.front_right.damage` | `5v` | `float32` | `percent` | `slow` | `game_specific` | ACC | Suspension damage at the front-right wheel. |
| `suspension.rear_left.damage` | `5w` | `float32` | `percent` | `slow` | `game_specific` | ACC | Suspension damage at the rear-left wheel. |
| `suspension.rear_right.damage` | `5x` | `float32` | `percent` | `slow` | `game_specific` | ACC | Suspension damage at the rear-right wheel. |
## Tyres

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `tyre.front_left.pressure_average` | `69` | `float32` | `kilopascal` | `slow` | `computed` | any | Tyre pressure at the front-left wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.front_right.pressure_average` | `6a` | `float32` | `kilopascal` | `slow` | `computed` | any | Tyre pressure at the front-right wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.rear_left.pressure_average` | `6b` | `float32` | `kilopascal` | `slow` | `computed` | any | Tyre pressure at the rear-left wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.rear_right.pressure_average` | `6c` | `float32` | `kilopascal` | `slow` | `computed` | any | Tyre pressure at the rear-right wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.front_left.temperature_average` | `6d` | `float32` | `celsius` | `slow` | `computed` | any | Tyre temperature at the front-left wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.front_right.temperature_average` | `6e` | `float32` | `celsius` | `slow` | `computed` | any | Tyre temperature at the front-right wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.rear_left.temperature_average` | `6f` | `float32` | `celsius` | `slow` | `computed` | any | Tyre temperature at the rear-left wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `tyre.rear_right.temperature_average` | `6g` | `float32` | `celsius` | `slow` | `computed` | any | Tyre temperature at the rear-right wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
## Brakes and suspension

| Canonical name | ID | Type | Unit | Rate | Availability | Games | Meaning |
|---|---:|---|---|---|---|---|---|
| `brake.front_left.temperature_average` | `6h` | `float32` | `celsius` | `slow` | `computed` | any | Brake temperature at the front-left wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `brake.front_right.temperature_average` | `6i` | `float32` | `celsius` | `slow` | `computed` | any | Brake temperature at the front-right wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `brake.rear_left.temperature_average` | `6j` | `float32` | `celsius` | `slow` | `computed` | any | Brake temperature at the rear-left wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
| `brake.rear_right.temperature_average` | `6k` | `float32` | `celsius` | `slow` | `computed` | any | Brake temperature at the rear-right wheel averaged over the last laps on track, sampled every three seconds outside the pits. |
