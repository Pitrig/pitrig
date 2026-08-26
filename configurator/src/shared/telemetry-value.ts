import type { TelemetryValueType } from './telemetry-catalog'
import { deviceFloat } from './contract-number'

export interface TelemetryValue {
  available: boolean
  type: TelemetryValueType
  number?: number
  text?: string
}

export const UNAVAILABLE: TelemetryValue = { available: false, type: 'float32' }

const TEXT_SOURCE_CAPACITY = 32

const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

export function parseSourceNumber(text: string): number | undefined {
  if (text.length === 0 || text.length >= TEXT_SOURCE_CAPACITY) return undefined
  if (!DECIMAL_NUMBER.test(text)) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? deviceFloat(parsed) : undefined
}

export function conditionValue(value: TelemetryValue | undefined): number | undefined {
  if (!value?.available) return undefined
  switch (value.type) {
    case 'boolean':
      return value.text === 'true' ? 1 : 0
    case 'text':
      return value.text === undefined ? undefined : parseSourceNumber(value.text)
    case 'float32':
      return Number.isFinite(value.number) ? deviceFloat(value.number as number) : undefined
    default:
      return Number.isFinite(value.number) ? value.number : undefined
  }
}

export function rawText(value: TelemetryValue): string | undefined {
  if (!value.available) return undefined
  if (value.type === 'boolean') return value.text === 'true' ? 'true' : 'false'
  if (value.type === 'text') return value.text
  return value.number === undefined ? undefined : String(value.number)
}

export function rangeFraction(
  value: number | undefined,
  minimum: number | undefined,
  maximum: number | undefined
): number {
  if (value === undefined) return 0
  const low = deviceFloat(minimum ?? 0)
  const high = deviceFloat(maximum ?? 1)
  const span = high - low
  if (!(span > 0)) return 0
  return deviceFloat(Math.min(Math.max((value - low) / span, 0), 1))
}
