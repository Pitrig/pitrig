import { TELEMETRY_CATALOG } from './telemetry-catalog'

export type BenchWaveform =
  | 'sine'
  | 'triangle'
  | 'sawtooth'
  | 'square'
  | 'pulse'
  | 'noise'
  | 'steps'
  | 'elapsed'

export interface BenchSignal {
  id: string
  binding: string
  label: string
  waveform: BenchWaveform
  frequencyHz: number
  minimum: number
  maximum: number
  decimals: number
  steps?: number
  gearText?: boolean
}

const WIRE_IDS = new Map<string, string>(
  TELEMETRY_CATALOG.map(({ name, wireId }) => [name, wireId])
)

export const BENCH_SIGNALS: readonly BenchSignal[] = [
  {
    id: 'rpm',
    binding: 'engine.rpm',
    label: 'Engine rpm',
    waveform: 'sawtooth',
    frequencyHz: 0.22,
    minimum: 900,
    maximum: 8_200,
    decimals: 0
  },
  {
    id: 'rpm_percent',
    binding: 'engine.rpm_percent',
    label: 'Rpm percent',
    waveform: 'sawtooth',
    frequencyHz: 0.22,
    minimum: 8,
    maximum: 99,
    decimals: 1
  },
  {
    id: 'speed',
    binding: 'vehicle.speed',
    label: 'Speed',
    waveform: 'sine',
    frequencyHz: 0.08,
    minimum: 0,
    maximum: 312,
    decimals: 0
  },
  {
    id: 'throttle',
    binding: 'vehicle.throttle',
    label: 'Throttle',
    waveform: 'triangle',
    frequencyHz: 0.45,
    minimum: 0,
    maximum: 100,
    decimals: 1
  },
  {
    id: 'brake',
    binding: 'vehicle.brake',
    label: 'Brake',
    waveform: 'pulse',
    frequencyHz: 0.31,
    minimum: 0,
    maximum: 100,
    decimals: 1
  },
  {
    id: 'steering',
    binding: 'vehicle.steering',
    label: 'Steering',
    waveform: 'sine',
    frequencyHz: 0.7,
    minimum: -1,
    maximum: 1,
    decimals: 3
  },
  {
    id: 'gear',
    binding: 'transmission.gear',
    label: 'Gear',
    waveform: 'steps',
    frequencyHz: 0.22,
    minimum: 0,
    maximum: 7,
    decimals: 0,
    steps: 8,
    gearText: true
  },
  {
    id: 'gear_number',
    binding: 'transmission.gear_number',
    label: 'Gear number',
    waveform: 'steps',
    frequencyHz: 0.22,
    minimum: 0,
    maximum: 7,
    decimals: 0,
    steps: 8
  },
  {
    id: 'lap_time',
    binding: 'session.lap.current_time',
    label: 'Lap time',
    waveform: 'elapsed',
    frequencyHz: 0,
    minimum: 0,
    maximum: 125_000,
    decimals: 0
  },
  {
    id: 'delta',
    binding: 'session.lap.delta',
    label: 'Lap delta',
    waveform: 'sine',
    frequencyHz: 0.05,
    minimum: -1_800,
    maximum: 1_800,
    decimals: 0
  },
  {
    id: 'water',
    binding: 'engine.water_temperature',
    label: 'Water temperature',
    waveform: 'sawtooth',
    frequencyHz: 0.017,
    minimum: 62,
    maximum: 108,
    decimals: 1
  },
  {
    id: 'turbo',
    binding: 'engine.turbo_pressure',
    label: 'Turbo pressure',
    waveform: 'noise',
    frequencyHz: 0,
    minimum: 0,
    maximum: 210,
    decimals: 1
  },
  {
    id: 'position',
    binding: 'session.position',
    label: 'Position',
    waveform: 'steps',
    frequencyHz: 0.09,
    minimum: 1,
    maximum: 12,
    decimals: 0,
    steps: 12
  },
  {
    id: 'frame',
    binding: 'vehicle.clutch',
    label: 'Clutch / sprite frame',
    waveform: 'steps',
    frequencyHz: 3,
    minimum: 0,
    maximum: 11,
    decimals: 0,
    steps: 12
  }
]

export const BENCH_SIGNAL_IDS: readonly string[] = BENCH_SIGNALS.map(({ id }) => id)

export function benchSignal(id: string): BenchSignal | undefined {
  return BENCH_SIGNALS.find((signal) => signal.id === id)
}

export function benchWireId(signal: BenchSignal): string | undefined {
  return WIRE_IDS.get(signal.binding)
}

export function benchSignalValue(signal: BenchSignal, elapsedMs: number): number {
  const span = signal.maximum - signal.minimum
  if (signal.waveform === 'elapsed') {
    return signal.minimum + (span > 0 ? elapsedMs % span : elapsedMs)
  }
  if (signal.waveform === 'noise') {
    return signal.minimum + Math.random() * span
  }
  const phase = (((elapsedMs / 1_000) * signal.frequencyHz) % 1 + 1) % 1
  return signal.minimum + unitOf(signal, phase) * span
}

export function benchSignalText(signal: BenchSignal, value: number): string {
  if (signal.gearText) {
    const gear = Math.round(value)
    return gear <= 0 ? 'N' : String(gear)
  }
  return value.toFixed(signal.decimals)
}

export function benchSignalLine(signal: BenchSignal, value: number): string | undefined {
  const wireId = benchWireId(signal)
  if (wireId === undefined) return undefined
  return `${wireId};${benchSignalText(signal, value)}\n`
}

function unitOf(signal: BenchSignal, phase: number): number {
  switch (signal.waveform) {
    case 'sine':
      return 0.5 + 0.5 * Math.sin(2 * Math.PI * phase)
    case 'triangle':
      return 1 - Math.abs(2 * phase - 1)
    case 'sawtooth':
      return phase
    case 'square':
      return phase < 0.5 ? 1 : 0
    case 'pulse':
      return phase < 0.18 ? 1 : 0
    case 'steps': {
      const steps = Math.max(2, signal.steps ?? 2)
      return Math.floor(phase * steps) / (steps - 1)
    }
    default:
      return 0
  }
}
