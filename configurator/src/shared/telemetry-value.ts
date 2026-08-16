import type { TelemetryValueType } from './telemetry-catalog'

// One telemetry reading as the device sees it. The preview needs the same shape
// the firmware reads, because the type decides what a transform will accept and
// what a rule can compare — a speed that arrives as text is not the same input
// as a speed that arrives as a float, even when they print identically.

export interface TelemetryValue {
  available: boolean
  type: TelemetryValueType
  /** Set for uint32, int32 and float32. */
  number?: number
  /** Set for text, and for the literal spelling of a boolean. */
  text?: string
}

export const UNAVAILABLE: TelemetryValue = { available: false, type: 'float32' }

/**
 * The numeric view of a value, mirroring `conditions::condition_value` in
 * `firmware/platform/dashboard/conditions`. Booleans read as 1 or 0, and a
 * source that carries its number as text is parsed — that is what lets a rule
 * watch a field like `vehicle.speed`, which arrives as a string. A string with
 * anything else in it has no numeric view at all, rather than a truncated one.
 */
export function conditionValue(value: TelemetryValue | undefined): number | undefined {
  if (!value?.available) return undefined
  switch (value.type) {
    case 'boolean':
      return value.text === 'true' ? 1 : 0
    case 'text': {
      const text = value.text?.trim()
      if (!text) return undefined
      const parsed = Number(text)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    default:
      return Number.isFinite(value.number) ? value.number : undefined
  }
}

/**
 * The value as the device would print it with no transform: text verbatim,
 * booleans as the words the firmware writes, numbers in their shortest form.
 */
export function rawText(value: TelemetryValue): string | undefined {
  if (!value.available) return undefined
  if (value.type === 'boolean') return value.text === 'true' ? 'true' : 'false'
  if (value.type === 'text') return value.text
  return value.number === undefined ? undefined : String(value.number)
}

/** Where a value sits in a window, clamped — `conditions::range_fraction`. */
export function rangeFraction(
  value: number | undefined,
  minimum: number | undefined,
  maximum: number | undefined
): number {
  if (value === undefined) return 0
  const low = minimum ?? 0
  const high = maximum ?? 1
  const span = high - low
  if (!(span > 0)) return 0
  return Math.min(Math.max((value - low) / span, 0), 1)
}
