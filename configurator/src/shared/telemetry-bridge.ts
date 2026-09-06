import { TELEMETRY_CATALOG, type TelemetryValueType } from './telemetry-catalog'
import type { TelemetryValue } from './telemetry-value'

export const TELEMETRY_BRIDGE_START_CHANNEL = 'telemetry-bridge:start' as const
export const TELEMETRY_BRIDGE_STOP_CHANNEL = 'telemetry-bridge:stop' as const
export const TELEMETRY_BRIDGE_STATUS_CHANNEL = 'telemetry-bridge:status' as const
export const TELEMETRY_BRIDGE_STATUS_CHANGED_CHANNEL = 'telemetry-bridge:status-changed' as const
export const TELEMETRY_BRIDGE_SNAPSHOT_CHANNEL = 'telemetry-bridge:snapshot' as const

export type TelemetryBridgeMode = 'hosted' | 'port'

export const HOSTED_MAXIMUM_BAUD_RATE = 230_400

export const SNAPSHOT_INTERVAL_MS = 16

export interface TelemetryBridgeStartRequest {
  mode: TelemetryBridgeMode
  portId?: string
  baudRate?: number
}

export interface LatencyQuantiles {
  p50: number
  p95: number
  p99: number
  max: number
  samples: number
}

export interface TelemetryBridgeMetrics {
  linesPerSecond: number
  bytesPerSecond: number
  fieldsPerSecond: number
  unknownLines: number
  droppedBytes: number
  writeErrors: number
  handoff: LatencyQuantiles
  drain: LatencyQuantiles
}

export interface TelemetryBridgeStatus {
  running: boolean
  hostingSupported: boolean
  relaying: boolean
  suspended: boolean
  metrics: TelemetryBridgeMetrics
  mode?: TelemetryBridgeMode
  listenPath?: string
  baudRate?: number
  error?: string
}

export interface TelemetrySnapshot {
  revision: number
  available: Uint8Array
  numbers: Float64Array
  texts: (string | null)[]
}

export const TELEMETRY_SLOT_COUNT = TELEMETRY_CATALOG.length

const SLOT_OF_NAME = new Map(TELEMETRY_CATALOG.map((entry, slot) => [entry.name as string, slot]))
const SLOT_OF_WIRE_ID = new Map(
  TELEMETRY_CATALOG.map((entry, slot) => [entry.wireId as string, slot])
)

export function slotOfName(name: string): number | undefined {
  return SLOT_OF_NAME.get(name)
}

export function slotOfWireId(wireId: string): number | undefined {
  return SLOT_OF_WIRE_ID.get(wireId)
}

export function slotType(slot: number): TelemetryValueType {
  return TELEMETRY_CATALOG[slot]?.type ?? 'float32'
}

export function emptyQuantiles(): LatencyQuantiles {
  return { p50: 0, p95: 0, p99: 0, max: 0, samples: 0 }
}

export function emptyBridgeMetrics(): TelemetryBridgeMetrics {
  return {
    linesPerSecond: 0,
    bytesPerSecond: 0,
    fieldsPerSecond: 0,
    unknownLines: 0,
    droppedBytes: 0,
    writeErrors: 0,
    handoff: emptyQuantiles(),
    drain: emptyQuantiles()
  }
}

export function idleBridgeStatus(hostingSupported: boolean): TelemetryBridgeStatus {
  return {
    running: false,
    hostingSupported,
    relaying: false,
    suspended: false,
    metrics: emptyBridgeMetrics()
  }
}

export function emptySnapshot(): TelemetrySnapshot {
  return {
    revision: 0,
    available: new Uint8Array(TELEMETRY_SLOT_COUNT),
    numbers: new Float64Array(TELEMETRY_SLOT_COUNT),
    texts: new Array<string | null>(TELEMETRY_SLOT_COUNT).fill(null)
  }
}

export function valueOfSlot(snapshot: TelemetrySnapshot, slot: number): TelemetryValue {
  const type = slotType(slot)
  if (!snapshot.available[slot]) return { available: false, type }
  const text = snapshot.texts[slot]
  if (type === 'boolean' || type === 'text') {
    return { available: true, type, text: text ?? '' }
  }
  return {
    available: true,
    type,
    number: snapshot.numbers[slot],
    ...(text === null ? {} : { text })
  }
}
