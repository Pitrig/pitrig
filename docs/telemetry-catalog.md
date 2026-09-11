# Telemetry catalog

This file is generated from `telemetry/telemetry_catalog.json`. It documents the bounded, protocol-neutral fields accepted by Pitrig. It does not define SimHub property formulas or game-specific source mappings.

Catalog version: 1. Fields: 228. Static limit: 256.

## Speed and controls

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `vehicle.speed` | `S` | `text` | `source` | `fast` | `common` | Vehicle speed formatted by the telemetry source. |
| `vehicle.throttle` | `00` | `float32` | `percent` | `fast` | `common` | Throttle pedal position. |
| `vehicle.brake` | `01` | `float32` | `percent` | `fast` | `common` | Brake pedal position. |
| `vehicle.clutch` | `02` | `float32` | `percent` | `fast` | `common` | Clutch pedal position. |
| `vehicle.handbrake` | `03` | `float32` | `percent` | `fast` | `optional` | Handbrake position. |
| `vehicle.steering` | `04` | `float32` | `normalized` | `fast` | `common` | Normalized steering position. |
| `vehicle.steering_angle` | `05` | `float32` | `degree` | `fast` | `optional` | Steering wheel angle. |
| `vehicle.brake_bias` | `BB` | `text` | `source` | `normal` | `optional` | Front-to-rear brake bias formatted by the telemetry source. |
## Engine

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `engine.rpm` | `R` | `text` | `source` | `fast` | `common` | Engine speed formatted by the telemetry source. |
| `engine.max_rpm` | `06` | `float32` | `rpm` | `changes` | `common` | Maximum engine speed. |
| `engine.shift_rpm` | `07` | `float32` | `rpm` | `changes` | `optional` | Recommended shift engine speed. |
| `engine.rpm_percent` | `08` | `float32` | `percent` | `fast` | `computed` | Engine speed as a percentage of maximum RPM. |
| `engine.running` | `09` | `boolean` | `boolean` | `normal` | `optional` | Whether the engine is running. |
| `engine.ignition` | `0a` | `boolean` | `boolean` | `normal` | `optional` | Whether ignition is enabled. |
| `engine.starter` | `0b` | `boolean` | `boolean` | `normal` | `optional` | Whether the starter is active. |
| `engine.water_temperature` | `0c` | `float32` | `celsius` | `slow` | `optional` | Engine coolant temperature. |
| `engine.oil_temperature` | `0d` | `float32` | `celsius` | `slow` | `optional` | Engine oil temperature. |
| `engine.oil_pressure` | `0e` | `float32` | `kilopascal` | `slow` | `optional` | Engine oil pressure. |
| `engine.turbo_pressure` | `0f` | `float32` | `kilopascal` | `fast` | `computed` | Turbocharger boost pressure. |
| `engine.turbo_level` | `0g` | `float32` | `percent` | `fast` | `optional` | Normalized turbocharger boost level. |
| `engine.torque` | `0h` | `float32` | `newton_meter` | `fast` | `game_specific` | Current engine torque. |
| `engine.power` | `0i` | `float32` | `kilowatt` | `fast` | `game_specific` | Current engine power. |
| `engine.map` | `0j` | `text` | `source` | `changes` | `optional` | Selected engine map. |
| `engine.damage` | `0k` | `float32` | `percent` | `slow` | `optional` | Engine damage level. |
## Transmission

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `transmission.gear` | `G` | `text` | `source` | `fast` | `common` | Current gear formatted by the telemetry source. |
| `transmission.gear_number` | `0l` | `int32` | `count` | `fast` | `common` | Current numeric gear. |
| `transmission.shifting` | `0m` | `boolean` | `boolean` | `fast` | `computed` | Whether a gear change is in progress. |
| `transmission.damage` | `0n` | `float32` | `percent` | `slow` | `optional` | Transmission damage level. |
## Laps and sectors

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `session.lap.current` | `0o` | `uint32` | `count` | `normal` | `common` | Current lap number. |
| `session.lap.total` | `0p` | `uint32` | `count` | `changes` | `common` | Total scheduled laps. |
| `session.lap.completed` | `0q` | `uint32` | `count` | `normal` | `common` | Completed lap count. |
| `session.lap.current_time` | `L` | `uint32` | `millisecond` | `normal` | `common` | Elapsed time on the current lap. |
| `session.lap.last_time` | `0r` | `uint32` | `millisecond` | `changes` | `common` | Previous lap time. |
| `session.lap.best_time` | `B` | `uint32` | `millisecond` | `changes` | `common` | Personal best lap time. |
| `session.lap.session_best_time` | `0s` | `uint32` | `millisecond` | `changes` | `optional` | Best lap time in the session. |
| `session.lap.estimated_time` | `P` | `uint32` | `millisecond` | `normal` | `computed` | Estimated current lap time. |
| `session.lap.delta` | `D` | `int32` | `millisecond` | `normal` | `computed` | Current signed lap-time delta. |
| `session.lap.delta_best` | `0t` | `int32` | `millisecond` | `normal` | `computed` | Signed delta to the personal best lap. |
| `session.lap.delta_session_best` | `0u` | `int32` | `millisecond` | `normal` | `computed` | Signed delta to the session best lap. |
| `session.lap.last_delta_best` | `LD` | `int32` | `millisecond` | `changes` | `computed` | Signed delta of the last lap to the personal best lap. |
| `session.lap.invalid` | `0v` | `boolean` | `boolean` | `normal` | `optional` | Whether the current lap is invalid. |
| `session.lap.valid` | `0w` | `boolean` | `boolean` | `normal` | `optional` | Whether the current lap is valid. |
| `session.sector.current` | `0x` | `uint32` | `count` | `normal` | `common` | Current sector number. |
| `session.sector.current_time` | `0y` | `uint32` | `millisecond` | `normal` | `optional` | Elapsed time in the current sector. |
| `session.sector.1_time` | `0z` | `uint32` | `millisecond` | `changes` | `optional` | Current lap sector one time. |
| `session.sector.2_time` | `10` | `uint32` | `millisecond` | `changes` | `optional` | Current lap sector two time. |
| `session.sector.3_time` | `11` | `uint32` | `millisecond` | `changes` | `optional` | Current lap sector three time. |
| `session.sector.1_best` | `12` | `uint32` | `millisecond` | `changes` | `computed` | Best sector one time. |
| `session.sector.2_best` | `13` | `uint32` | `millisecond` | `changes` | `computed` | Best sector two time. |
| `session.sector.3_best` | `14` | `uint32` | `millisecond` | `changes` | `computed` | Best sector three time. |
| `session.sector.delta` | `15` | `int32` | `millisecond` | `normal` | `computed` | Signed time gained or lost so far in the current sector against the best lap. |
| `track.position_percent` | `16` | `float32` | `percent` | `fast` | `common` | Vehicle position around the lap. |
## Session and position

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `session.type` | `17` | `text` | `source` | `changes` | `common` | Session type such as practice, qualifying, or race. |
| `session.name` | `18` | `text` | `source` | `changes` | `optional` | Session name. |
| `session.phase` | `19` | `text` | `source` | `changes` | `optional` | Current session phase. |
| `session.position` | `1a` | `uint32` | `count` | `normal` | `common` | Overall race position. |
| `session.class_position` | `1b` | `uint32` | `count` | `normal` | `computed` | Position within the vehicle class, known in a single-class session. |
| `session.participants` | `1c` | `uint32` | `count` | `changes` | `common` | Participant count. |
| `session.class_participants` | `1d` | `uint32` | `count` | `changes` | `optional` | Participant count within the vehicle class. |
| `session.time_elapsed` | `1e` | `uint32` | `millisecond` | `normal` | `common` | Elapsed session time. |
| `session.time_remaining` | `1f` | `uint32` | `millisecond` | `normal` | `common` | Remaining session time. |
| `session.laps_remaining` | `1g` | `uint32` | `count` | `normal` | `computed` | Remaining session laps including the current one, estimated from the best lap in a timed session. |
| `session.is_timed` | `1h` | `boolean` | `boolean` | `changes` | `computed` | Whether the session is time limited. |
| `session.finished` | `1i` | `boolean` | `boolean` | `changes` | `optional` | Whether the player has finished. |
| `session.checkered` | `1j` | `boolean` | `boolean` | `changes` | `common` | Whether the checkered flag has been shown. |
| `session.starting_grid_position` | `1k` | `uint32` | `count` | `changes` | `optional` | Starting grid position. |
| `session.gap_ahead` | `1l` | `text` | `source` | `normal` | `computed` | Gap in seconds to the car one race position ahead. |
| `session.gap_behind` | `1m` | `text` | `source` | `normal` | `computed` | Gap in seconds to the car one race position behind. |
| `session.gap_leader` | `1n` | `text` | `source` | `normal` | `computed` | Gap to the session leader. |
## Fuel and energy

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `vehicle.fuel.level` | `F` | `text` | `source` | `slow` | `common` | Fuel level formatted by the telemetry source. |
| `vehicle.fuel.percent` | `1o` | `float32` | `percent` | `slow` | `computed` | Fuel tank level percentage. |
| `vehicle.fuel.capacity` | `1p` | `float32` | `liter` | `changes` | `optional` | Fuel tank capacity. |
| `vehicle.fuel.average_consumption` | `FC` | `text` | `source` | `slow` | `computed` | Average fuel consumption formatted by the telemetry source. |
| `vehicle.fuel.current_consumption` | `1q` | `float32` | `liter` | `slow` | `computed` | Fuel used on the current lap. |
| `vehicle.fuel.laps_remaining` | `FL` | `text` | `source` | `slow` | `computed` | Estimated fuel laps remaining formatted by the telemetry source. |
| `vehicle.fuel.time_remaining` | `1r` | `uint32` | `millisecond` | `slow` | `computed` | Estimated driving time remaining on fuel at the best-lap pace. |
| `vehicle.fuel.required_to_finish` | `1s` | `float32` | `liter` | `slow` | `computed` | Estimated fuel required to finish the session. |
| `vehicle.fuel.to_add` | `1t` | `float32` | `liter` | `slow` | `computed` | Fuel to add to finish the session. |
| `vehicle.fuel.last_lap_consumption` | `1u` | `float32` | `liter` | `changes` | `computed` | Fuel used on the previous lap. |
| `vehicle.energy.level` | `1v` | `float32` | `source` | `normal` | `optional` | Remaining electrical energy. |
| `vehicle.energy.percent` | `1w` | `float32` | `percent` | `normal` | `optional` | Electrical energy percentage. |
| `vehicle.energy.deployment_mode` | `1x` | `text` | `source` | `changes` | `optional` | Selected energy deployment mode. |
| `vehicle.energy.recovery_mode` | `1y` | `text` | `source` | `changes` | `optional` | Selected energy recovery mode. |
| `vehicle.energy.laps_remaining` | `1z` | `float32` | `count` | `slow` | `computed` | Estimated laps remaining on electrical energy. |
## Electronics and vehicle state

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `vehicle.aids.traction_control_level` | `T` | `text` | `source` | `normal` | `optional` | Configured traction-control level. |
| `vehicle.aids.traction_control_active` | `20` | `boolean` | `boolean` | `fast` | `optional` | Whether traction control is intervening. |
| `vehicle.aids.abs_level` | `A` | `text` | `source` | `normal` | `optional` | Configured ABS level. |
| `vehicle.aids.abs_active` | `21` | `boolean` | `boolean` | `fast` | `optional` | Whether ABS is intervening. |
| `vehicle.aids.stability_control` | `22` | `text` | `source` | `normal` | `optional` | Configured stability-control level. |
| `vehicle.pit_limiter.enabled` | `23` | `boolean` | `boolean` | `fast` | `common` | Whether the pit limiter is enabled. |
| `vehicle.in_pit_lane` | `24` | `boolean` | `boolean` | `normal` | `common` | Whether the vehicle is in the pit lane. |
| `vehicle.in_pit_box` | `25` | `boolean` | `boolean` | `normal` | `optional` | Whether the vehicle is stopped in its pit box. |
| `vehicle.pit_requested` | `26` | `boolean` | `boolean` | `changes` | `optional` | Whether a pit stop has been requested. |
| `vehicle.drs.available` | `27` | `boolean` | `boolean` | `normal` | `optional` | Whether DRS is available. |
| `vehicle.drs.active` | `28` | `boolean` | `boolean` | `fast` | `optional` | Whether DRS is active. |
| `vehicle.push_to_pass.available` | `29` | `boolean` | `boolean` | `normal` | `optional` | Whether push-to-pass is available. |
| `vehicle.push_to_pass.active` | `2a` | `boolean` | `boolean` | `fast` | `optional` | Whether push-to-pass is active. |
| `vehicle.headlights` | `2b` | `text` | `source` | `changes` | `optional` | Headlight state. |
| `vehicle.wipers` | `2c` | `text` | `source` | `changes` | `optional` | Wiper mode. |
| `vehicle.horn` | `2d` | `boolean` | `boolean` | `fast` | `optional` | Whether the horn is active. |
| `vehicle.speed_limiter` | `2e` | `boolean` | `boolean` | `fast` | `optional` | Whether a non-pit speed limiter is active. |
| `vehicle.damage.aero` | `2f` | `float32` | `percent` | `slow` | `optional` | Aerodynamic damage level. |
| `vehicle.damage.suspension` | `2g` | `float32` | `percent` | `slow` | `optional` | Overall suspension damage level. |
| `vehicle.damage.transmission` | `2h` | `float32` | `percent` | `slow` | `optional` | Overall transmission damage level. |
## Flags and messages

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `session.flag.current` | `2i` | `text` | `source` | `normal` | `common` | Current primary flag state. |
| `session.flag.green` | `2j` | `boolean` | `boolean` | `normal` | `common` | Whether a green flag is active. |
| `session.flag.yellow` | `2k` | `boolean` | `boolean` | `normal` | `common` | Whether a yellow flag is active. |
| `session.flag.blue` | `2l` | `boolean` | `boolean` | `normal` | `common` | Whether a blue flag is active. |
| `session.flag.white` | `2m` | `boolean` | `boolean` | `normal` | `optional` | Whether a white flag is active. |
| `session.flag.red` | `2n` | `boolean` | `boolean` | `normal` | `optional` | Whether a red flag is active. |
| `session.flag.black` | `2o` | `boolean` | `boolean` | `normal` | `optional` | Whether a black flag is active. |
| `session.flag.checkered` | `2p` | `boolean` | `boolean` | `normal` | `common` | Whether a checkered flag is active. |
| `session.flag.black_white` | `2q` | `boolean` | `boolean` | `normal` | `optional` | Whether a black-and-white warning flag is active. |
| `session.flag.black_orange` | `2r` | `boolean` | `boolean` | `normal` | `optional` | Whether a black-and-orange mechanical flag is active. |
| `session.local_yellow` | `2s` | `boolean` | `boolean` | `normal` | `optional` | Whether a local yellow is active. |
| `session.safety_car` | `2t` | `boolean` | `boolean` | `normal` | `optional` | Whether the safety car is active. |
| `session.virtual_safety_car` | `2u` | `boolean` | `boolean` | `normal` | `optional` | Whether virtual safety car conditions are active. |
| `session.penalty.active` | `2v` | `boolean` | `boolean` | `normal` | `optional` | Whether the player has an active penalty. |
| `session.penalty.type` | `2w` | `text` | `source` | `changes` | `optional` | Active penalty type. |
| `session.penalty.time` | `2x` | `int32` | `millisecond` | `changes` | `optional` | Penalty time. |
| `session.penalty.message` | `2y` | `text` | `source` | `changes` | `optional` | Penalty or race-control message. |
## Track and weather

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `track.name` | `2z` | `text` | `source` | `changes` | `common` | Track name. |
| `track.configuration` | `30` | `text` | `source` | `changes` | `optional` | Track configuration or layout. |
| `track.length` | `31` | `float32` | `meter` | `changes` | `common` | Track lap length. |
| `track.temperature` | `32` | `float32` | `celsius` | `slow` | `optional` | Track surface temperature. |
| `track.wetness` | `33` | `float32` | `percent` | `slow` | `optional` | Track wetness level. |
| `environment.air_temperature` | `34` | `float32` | `celsius` | `slow` | `optional` | Ambient air temperature. |
| `environment.rain_level` | `35` | `float32` | `percent` | `slow` | `optional` | Rain intensity. |
| `environment.wind_speed` | `36` | `float32` | `meter_per_second` | `slow` | `optional` | Wind speed. |
| `environment.wind_direction` | `37` | `float32` | `degree` | `slow` | `optional` | Wind direction. |
| `environment.time_of_day` | `38` | `text` | `source` | `slow` | `optional` | Simulation time of day. |
| `environment.cloud_level` | `39` | `float32` | `percent` | `slow` | `optional` | Cloud cover level. |
| `environment.forecast` | `3a` | `text` | `source` | `changes` | `game_specific` | Weather forecast. |
## Motion and vehicle physics

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `motion.acceleration_longitudinal` | `3b` | `float32` | `meter_per_second_squared` | `fast` | `optional` | Longitudinal acceleration. |
| `motion.acceleration_lateral` | `3c` | `float32` | `meter_per_second_squared` | `fast` | `optional` | Lateral acceleration. |
| `motion.acceleration_vertical` | `3d` | `float32` | `meter_per_second_squared` | `fast` | `optional` | Vertical acceleration. |
| `motion.g_force_longitudinal` | `3e` | `float32` | `g` | `fast` | `optional` | Longitudinal G force. |
| `motion.g_force_lateral` | `3f` | `float32` | `g` | `fast` | `optional` | Lateral G force. |
| `motion.g_force_vertical` | `3g` | `float32` | `g` | `fast` | `optional` | Vertical G force. |
| `motion.pitch` | `3h` | `float32` | `degree` | `fast` | `optional` | Vehicle pitch angle. |
| `motion.roll` | `3i` | `float32` | `degree` | `fast` | `optional` | Vehicle roll angle. |
| `motion.yaw` | `3j` | `float32` | `degree` | `fast` | `optional` | Vehicle yaw angle. |
| `motion.slip_angle` | `3k` | `float32` | `degree` | `fast` | `computed` | Vehicle slip angle from the local velocity. |
| `motion.ffb_force` | `3l` | `float32` | `normalized` | `fast` | `game_specific` | Current force-feedback signal. |
## Tyres

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `tyre.front_left.pressure` | `3m` | `float32` | `kilopascal` | `slow` | `optional` | Tyre pressure at the front-left wheel. |
| `tyre.front_right.pressure` | `3n` | `float32` | `kilopascal` | `slow` | `optional` | Tyre pressure at the front-right wheel. |
| `tyre.rear_left.pressure` | `3o` | `float32` | `kilopascal` | `slow` | `optional` | Tyre pressure at the rear-left wheel. |
| `tyre.rear_right.pressure` | `3p` | `float32` | `kilopascal` | `slow` | `optional` | Tyre pressure at the rear-right wheel. |
| `tyre.front_left.temperature` | `3q` | `float32` | `celsius` | `slow` | `optional` | Average tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature` | `3r` | `float32` | `celsius` | `slow` | `optional` | Average tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature` | `3s` | `float32` | `celsius` | `slow` | `optional` | Average tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature` | `3t` | `float32` | `celsius` | `slow` | `optional` | Average tyre temperature at the rear-right wheel. |
| `tyre.front_left.temperature_inner` | `3u` | `float32` | `celsius` | `slow` | `optional` | Inner tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature_inner` | `3v` | `float32` | `celsius` | `slow` | `optional` | Inner tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature_inner` | `3w` | `float32` | `celsius` | `slow` | `optional` | Inner tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature_inner` | `3x` | `float32` | `celsius` | `slow` | `optional` | Inner tyre temperature at the rear-right wheel. |
| `tyre.front_left.temperature_middle` | `3y` | `float32` | `celsius` | `slow` | `optional` | Middle tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature_middle` | `3z` | `float32` | `celsius` | `slow` | `optional` | Middle tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature_middle` | `40` | `float32` | `celsius` | `slow` | `optional` | Middle tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature_middle` | `41` | `float32` | `celsius` | `slow` | `optional` | Middle tyre temperature at the rear-right wheel. |
| `tyre.front_left.temperature_outer` | `42` | `float32` | `celsius` | `slow` | `optional` | Outer tyre temperature at the front-left wheel. |
| `tyre.front_right.temperature_outer` | `43` | `float32` | `celsius` | `slow` | `optional` | Outer tyre temperature at the front-right wheel. |
| `tyre.rear_left.temperature_outer` | `44` | `float32` | `celsius` | `slow` | `optional` | Outer tyre temperature at the rear-left wheel. |
| `tyre.rear_right.temperature_outer` | `45` | `float32` | `celsius` | `slow` | `optional` | Outer tyre temperature at the rear-right wheel. |
| `tyre.front_left.carcass_temperature` | `46` | `float32` | `celsius` | `slow` | `game_specific` | Tyre carcass temperature at the front-left wheel. |
| `tyre.front_right.carcass_temperature` | `47` | `float32` | `celsius` | `slow` | `game_specific` | Tyre carcass temperature at the front-right wheel. |
| `tyre.rear_left.carcass_temperature` | `48` | `float32` | `celsius` | `slow` | `game_specific` | Tyre carcass temperature at the rear-left wheel. |
| `tyre.rear_right.carcass_temperature` | `49` | `float32` | `celsius` | `slow` | `game_specific` | Tyre carcass temperature at the rear-right wheel. |
| `tyre.front_left.surface_temperature` | `4a` | `float32` | `celsius` | `slow` | `game_specific` | Tyre surface temperature at the front-left wheel. |
| `tyre.front_right.surface_temperature` | `4b` | `float32` | `celsius` | `slow` | `game_specific` | Tyre surface temperature at the front-right wheel. |
| `tyre.rear_left.surface_temperature` | `4c` | `float32` | `celsius` | `slow` | `game_specific` | Tyre surface temperature at the rear-left wheel. |
| `tyre.rear_right.surface_temperature` | `4d` | `float32` | `celsius` | `slow` | `game_specific` | Tyre surface temperature at the rear-right wheel. |
| `tyre.front_left.wear` | `4e` | `float32` | `percent` | `slow` | `optional` | Tyre wear at the front-left wheel. |
| `tyre.front_right.wear` | `4f` | `float32` | `percent` | `slow` | `optional` | Tyre wear at the front-right wheel. |
| `tyre.rear_left.wear` | `4g` | `float32` | `percent` | `slow` | `optional` | Tyre wear at the rear-left wheel. |
| `tyre.rear_right.wear` | `4h` | `float32` | `percent` | `slow` | `optional` | Tyre wear at the rear-right wheel. |
| `tyre.front_left.detached` | `4i` | `boolean` | `boolean` | `changes` | `game_specific` | Whether the front-left wheel is detached. |
| `tyre.front_right.detached` | `4j` | `boolean` | `boolean` | `changes` | `game_specific` | Whether the front-right wheel is detached. |
| `tyre.rear_left.detached` | `4k` | `boolean` | `boolean` | `changes` | `game_specific` | Whether the rear-left wheel is detached. |
| `tyre.rear_right.detached` | `4l` | `boolean` | `boolean` | `changes` | `game_specific` | Whether the rear-right wheel is detached. |
| `tyre.front_left.punctured` | `4m` | `boolean` | `boolean` | `normal` | `optional` | Whether the front-left tyre is punctured. |
| `tyre.front_right.punctured` | `4n` | `boolean` | `boolean` | `normal` | `optional` | Whether the front-right tyre is punctured. |
| `tyre.rear_left.punctured` | `4o` | `boolean` | `boolean` | `normal` | `optional` | Whether the rear-left tyre is punctured. |
| `tyre.rear_right.punctured` | `4p` | `boolean` | `boolean` | `normal` | `optional` | Whether the rear-right tyre is punctured. |
| `tyre.front_left.flat_spot` | `4q` | `float32` | `normalized` | `normal` | `game_specific` | Flat-spot level at the front-left tyre. |
| `tyre.front_right.flat_spot` | `4r` | `float32` | `normalized` | `normal` | `game_specific` | Flat-spot level at the front-right tyre. |
| `tyre.rear_left.flat_spot` | `4s` | `float32` | `normalized` | `normal` | `game_specific` | Flat-spot level at the rear-left tyre. |
| `tyre.rear_right.flat_spot` | `4t` | `float32` | `normalized` | `normal` | `game_specific` | Flat-spot level at the rear-right tyre. |
| `tyre.front_left.slip` | `4u` | `float32` | `normalized` | `fast` | `game_specific` | Wheel slip at the front-left wheel. |
| `tyre.front_right.slip` | `4v` | `float32` | `normalized` | `fast` | `game_specific` | Wheel slip at the front-right wheel. |
| `tyre.rear_left.slip` | `4w` | `float32` | `normalized` | `fast` | `game_specific` | Wheel slip at the rear-left wheel. |
| `tyre.rear_right.slip` | `4x` | `float32` | `normalized` | `fast` | `game_specific` | Wheel slip at the rear-right wheel. |
| `tyre.front_left.load` | `4y` | `float32` | `newton` | `fast` | `game_specific` | Vertical tyre load at the front-left wheel. |
| `tyre.front_right.load` | `4z` | `float32` | `newton` | `fast` | `game_specific` | Vertical tyre load at the front-right wheel. |
| `tyre.rear_left.load` | `50` | `float32` | `newton` | `fast` | `game_specific` | Vertical tyre load at the rear-left wheel. |
| `tyre.rear_right.load` | `51` | `float32` | `newton` | `fast` | `game_specific` | Vertical tyre load at the rear-right wheel. |
| `tyre.front_left.rotation_speed` | `52` | `float32` | `radian_per_second` | `fast` | `game_specific` | Rotation speed of the front-left wheel. |
| `tyre.front_right.rotation_speed` | `53` | `float32` | `radian_per_second` | `fast` | `game_specific` | Rotation speed of the front-right wheel. |
| `tyre.rear_left.rotation_speed` | `54` | `float32` | `radian_per_second` | `fast` | `game_specific` | Rotation speed of the rear-left wheel. |
| `tyre.rear_right.rotation_speed` | `55` | `float32` | `radian_per_second` | `fast` | `game_specific` | Rotation speed of the rear-right wheel. |
## Brakes and suspension

| Canonical name | ID | Type | Unit | Rate | Availability | Meaning |
|---|---:|---|---|---|---|---|
| `brake.front_left.temperature` | `56` | `float32` | `celsius` | `slow` | `optional` | Brake temperature at the front-left wheel. |
| `brake.front_right.temperature` | `57` | `float32` | `celsius` | `slow` | `optional` | Brake temperature at the front-right wheel. |
| `brake.rear_left.temperature` | `58` | `float32` | `celsius` | `slow` | `optional` | Brake temperature at the rear-left wheel. |
| `brake.rear_right.temperature` | `59` | `float32` | `celsius` | `slow` | `optional` | Brake temperature at the rear-right wheel. |
| `brake.front_left.pressure` | `5a` | `float32` | `kilopascal` | `fast` | `game_specific` | Brake pressure at the front-left wheel. |
| `brake.front_right.pressure` | `5b` | `float32` | `kilopascal` | `fast` | `game_specific` | Brake pressure at the front-right wheel. |
| `brake.rear_left.pressure` | `5c` | `float32` | `kilopascal` | `fast` | `game_specific` | Brake pressure at the rear-left wheel. |
| `brake.rear_right.pressure` | `5d` | `float32` | `kilopascal` | `fast` | `game_specific` | Brake pressure at the rear-right wheel. |
| `brake.front_left.wear` | `5e` | `float32` | `percent` | `slow` | `optional` | Brake wear at the front-left wheel. |
| `brake.front_right.wear` | `5f` | `float32` | `percent` | `slow` | `optional` | Brake wear at the front-right wheel. |
| `brake.rear_left.wear` | `5g` | `float32` | `percent` | `slow` | `optional` | Brake wear at the rear-left wheel. |
| `brake.rear_right.wear` | `5h` | `float32` | `percent` | `slow` | `optional` | Brake wear at the rear-right wheel. |
| `brake.front_left.abs_active` | `5i` | `boolean` | `boolean` | `fast` | `game_specific` | Whether ABS is active at the front-left wheel. |
| `brake.front_right.abs_active` | `5j` | `boolean` | `boolean` | `fast` | `game_specific` | Whether ABS is active at the front-right wheel. |
| `brake.rear_left.abs_active` | `5k` | `boolean` | `boolean` | `fast` | `game_specific` | Whether ABS is active at the rear-left wheel. |
| `brake.rear_right.abs_active` | `5l` | `boolean` | `boolean` | `fast` | `game_specific` | Whether ABS is active at the rear-right wheel. |
| `suspension.front_left.travel` | `5m` | `float32` | `millimeter` | `fast` | `game_specific` | Suspension travel at the front-left wheel. |
| `suspension.front_right.travel` | `5n` | `float32` | `millimeter` | `fast` | `game_specific` | Suspension travel at the front-right wheel. |
| `suspension.rear_left.travel` | `5o` | `float32` | `millimeter` | `fast` | `game_specific` | Suspension travel at the rear-left wheel. |
| `suspension.rear_right.travel` | `5p` | `float32` | `millimeter` | `fast` | `game_specific` | Suspension travel at the rear-right wheel. |
| `suspension.front_left.velocity` | `5q` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | Suspension velocity at the front-left wheel. |
| `suspension.front_right.velocity` | `5r` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | Suspension velocity at the front-right wheel. |
| `suspension.rear_left.velocity` | `5s` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | Suspension velocity at the rear-left wheel. |
| `suspension.rear_right.velocity` | `5t` | `float32` | `millimeter_per_second` | `fast` | `game_specific` | Suspension velocity at the rear-right wheel. |
| `suspension.front_left.damage` | `5u` | `float32` | `percent` | `slow` | `game_specific` | Suspension damage at the front-left wheel. |
| `suspension.front_right.damage` | `5v` | `float32` | `percent` | `slow` | `game_specific` | Suspension damage at the front-right wheel. |
| `suspension.rear_left.damage` | `5w` | `float32` | `percent` | `slow` | `game_specific` | Suspension damage at the rear-left wheel. |
| `suspension.rear_right.damage` | `5x` | `float32` | `percent` | `slow` | `game_specific` | Suspension damage at the rear-right wheel. |
