import { TELEMETRY_CATALOG, type TelemetryCatalogEntry } from './telemetry-catalog'
import type { TelemetryValue } from './telemetry-value'

// A synthetic lap, so the preview can be judged the way the dashboard will be
// read. The fields are derived from one another rather than generated
// independently: the speed comes from a track profile, the gear from the speed,
// the engine speed from where the car sits inside that gear, and the pedals from
// whether the car is gaining or losing speed. A rev strip and a speed readout on
// the same dashboard therefore agree, which is the entire point — two unrelated
// sawtooths would look plausible one widget at a time and wrong together.
//
// Everything is a pure function of the lap phase. That matters twice over:
// scrubbing costs nothing, and the graph widget can draw an exact trace by
// asking for the phases that came before this one.

export const LAP_SECONDS = 92

/** Where each gear takes over, in km/h. */
const GEAR_SPEEDS = [0, 62, 98, 138, 184, 238, 310]

const IDLE_RPM = 1150
const LIMIT_RPM = 7600

export interface LapState {
  /** Seconds into the lap. */
  time: number
  speed: number
  gear: number
  rpm: number
  rpmPercent: number
  throttle: number
  brake: number
}

/**
 * The car's state at a point in the lap. The speed profile is three sinusoids —
 * one long straight, a pair of corner sequences, and a chicane — which gives a
 * lap with distinct fast and slow sections instead of a single sweep.
 */
export function lapState(phase: number): LapState {
  const wrapped = ((phase % 1) + 1) % 1
  const time = wrapped * LAP_SECONDS
  const speed = speedAt(wrapped)
  // A moment either side, so the pedals follow the change rather than the value.
  const acceleration = (speedAt(wrapped + 0.004) - speedAt(wrapped - 0.004)) / 2

  // Gear n spans [GEAR_SPEEDS[n - 1], GEAR_SPEEDS[n]), so first gear starts at
  // a standstill rather than at the speed first gear tops out at.
  let gear = 1
  while (gear < GEAR_SPEEDS.length - 1 && speed >= (GEAR_SPEEDS[gear] ?? Infinity)) gear += 1
  const floor = GEAR_SPEEDS[gear - 1] ?? 0
  const ceiling = GEAR_SPEEDS[gear] ?? floor + 60
  // Every gear starts a little way up the rev range and runs to the limiter, so
  // a shift drops the needle rather than resetting it.
  const withinGear = clamp01((speed - floor) / Math.max(ceiling - floor, 1))
  const rpmPercent = clamp01(0.32 + withinGear * 0.68)

  return {
    time,
    speed,
    gear,
    rpm: IDLE_RPM + rpmPercent * (LIMIT_RPM - IDLE_RPM),
    rpmPercent,
    throttle: clamp01(acceleration / 6),
    brake: clamp01(-acceleration / 5)
  }
}

function speedAt(phase: number): number {
  const angle = phase * Math.PI * 2
  const profile =
    168 + 88 * Math.sin(angle) + 42 * Math.sin(angle * 3 + 1.1) - 26 * Math.sin(angle * 5 + 0.4)
  return Math.min(Math.max(profile, 48), 302)
}

/**
 * Fields worth deriving from the lap rather than from their unit. Everything
 * here is something an author actually points a widget at, and something that
 * would look wrong if it disagreed with its neighbours.
 */
const SCENARIO: Record<string, (lap: LapState) => number> = {
  'vehicle.speed': (lap) => lap.speed,
  'vehicle.speed_kmh': (lap) => lap.speed,
  'vehicle.speed_mph': (lap) => lap.speed * 0.621371,
  'engine.rpm': (lap) => lap.rpm,
  'engine.rpm_percent': (lap) => lap.rpmPercent,
  'engine.rpm_max': () => LIMIT_RPM,
  'engine.running': () => 1,
  'transmission.gear': (lap) => lap.gear,
  'vehicle.throttle': (lap) => lap.throttle,
  'vehicle.brake': (lap) => lap.brake,
  // Released: the lap is driven flat, and a clutch that twitched would only
  // distract from the widgets being judged.
  'vehicle.clutch': () => 0,
  'vehicle.steering': (lap) => Math.sin((lap.time / LAP_SECONDS) * Math.PI * 6) * 0.6,
  // A lap that counts up, against a best that stays put and a delta that wanders
  // either side of zero — which is what makes a delta widget worth previewing.
  'session.lap.current_time': (lap) => lap.time * 1000,
  'session.lap.last_time': () => 94_320,
  'session.lap.best_time': () => 91_780,
  'session.lap.delta': (lap) => Math.sin((lap.time / LAP_SECONDS) * Math.PI * 4) * 900,
  'session.lap.delta_best': (lap) => Math.sin((lap.time / LAP_SECONDS) * Math.PI * 4) * 900,
  'session.lap.delta_session_best': (lap) =>
    Math.sin((lap.time / LAP_SECONDS) * Math.PI * 4) * 900 + 240,
  'session.lap.number': () => 7,
  'session.lap.count': () => 24,
  'session.position': () => 3,
  'session.participants': () => 24,
  'vehicle.fuel.level': (lap) => 41.5 - (lap.time / LAP_SECONDS) * 1.9,
  'vehicle.fuel.percent': (lap) => 0.62 - (lap.time / LAP_SECONDS) * 0.03,
  'engine.water_temperature': (lap) => 88 + lap.rpmPercent * 6,
  'engine.oil_temperature': (lap) => 104 + lap.rpmPercent * 8,
  'engine.turbo_pressure': (lap) => lap.throttle * 1.6
}

/** Tyres and brakes: the same shape for all four corners, offset a little. */
const CORNER_OFFSETS = ['front_left', 'front_right', 'rear_left', 'rear_right']

export function mockValue(entry: TelemetryCatalogEntry, phase: number): TelemetryValue {
  const lap = lapState(phase)
  const numeric = SCENARIO[entry.name]?.(lap) ?? derivedValue(entry, lap)
  return asValue(entry, numeric)
}

/**
 * A plausible reading for a field the scenario does not name, taken from its
 * unit. A temperature that reads 0 °C or a pressure that reads 0 kPa would make
 * a correctly configured widget look broken.
 */
function derivedValue(entry: TelemetryCatalogEntry, lap: LapState): number {
  const corner = CORNER_OFFSETS.findIndex((suffix) => entry.name.endsWith(suffix))
  const drift = corner < 0 ? 0 : corner * 0.05
  const wave = Math.sin((lap.time / LAP_SECONDS) * Math.PI * 2 + drift * 10)
  switch (entry.unit) {
    case 'percent':
    case 'normalized':
      return clamp01(0.5 + 0.42 * wave + drift)
    case 'celsius':
      // Tyres and brakes run hot; anything else sits in a fluid's range.
      return entry.category === 'tyres' || entry.category === 'brakes_suspension'
        ? 78 + 22 * lap.rpmPercent + drift * 60 + 6 * wave
        : 92 + 8 * wave
    case 'kilopascal':
      return 186 + 14 * wave + drift * 40
    case 'millisecond':
      return lap.time * 1000
    case 'rpm':
      return lap.rpm
    case 'degree':
      return 180 * wave
    case 'radian_per_second':
      return lap.speed / 1.8
    case 'liter':
      return 41.5 - (lap.time / LAP_SECONDS) * 1.9
    case 'newton':
      return 2400 + 900 * wave
    case 'newton_meter':
      return 320 + 140 * lap.throttle
    case 'kilowatt':
      return 180 + 140 * lap.throttle
    case 'meter_per_second':
      return lap.speed / 3.6
    case 'meter_per_second_squared':
    case 'g':
      return 1.4 * wave
    case 'millimeter':
      return 34 + 12 * wave
    case 'millimeter_per_second':
      return 60 * wave
    case 'meter':
      return (lap.time / LAP_SECONDS) * 4300
    case 'count':
      return Math.round(3 + 2 * Math.abs(wave))
    case 'boolean':
      // Slow enough to read: a flag that flickers every frame teaches nothing.
      return wave > 0.55 ? 1 : 0
    default:
      return lap.speed
  }
}

/** Wraps a number in the shape the catalog says this field arrives in. */
function asValue(entry: TelemetryCatalogEntry, numeric: number): TelemetryValue {
  switch (entry.type) {
    case 'boolean':
      return { available: true, type: 'boolean', text: numeric >= 0.5 ? 'true' : 'false' }
    case 'text':
      // Text-typed fields carry a pre-formatted reading on the wire, which is
      // why a number transform on one has to parse it back.
      return {
        available: true,
        type: 'text',
        text: Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1)
      }
    case 'uint32':
      return { available: true, type: 'uint32', number: Math.max(0, Math.round(numeric)) }
    case 'int32':
      return { available: true, type: 'int32', number: Math.round(numeric) }
    default:
      return { available: true, type: 'float32', number: numeric }
  }
}

/**
 * Values for the bindings a dashboard reads. Unknown names are left out rather
 * than invented, so a mistyped binding still looks unbound in the preview.
 */
export function mockTelemetry(
  bindings: Iterable<string>,
  phase: number
): Map<string, TelemetryValue> {
  const values = new Map<string, TelemetryValue>()
  for (const binding of bindings) {
    const entry = TELEMETRY_CATALOG.find(({ name }) => name === binding)
    if (entry) values.set(binding, mockValue(entry, phase))
  }
  return values
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
