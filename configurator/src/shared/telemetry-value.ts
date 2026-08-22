import type { TelemetryValueType } from './telemetry-catalog'
import { deviceFloat } from './contract-number'

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

/** Storage the device gives one text reading, terminator included. */
const TEXT_SOURCE_CAPACITY = 32

/**
 * A text reading as a number, mirroring `number_transform::parse`.
 *
 * Deliberately not `Number(text)`. The firmware refuses a value that does not
 * *start* with a digit, a sign or a point — so a leading blank, `inf` and `nan`
 * are all refused — it requires `strtof` to consume the text whole, so a
 * trailing blank is refused too, and it has 32 bytes to copy the text into.
 * `Number` accepts all three after a trim, which is how a preview comes to show
 * a reading the board treats as unavailable, or a styling rule to match here and
 * not there. The result is narrowed to float32 because that is what the device
 * parses into.
 *
 * The one form this does not follow is the hexadecimal float `strtof` also
 * reads (`0x1p3`). No telemetry source emits one, and reproducing that grammar
 * would cost more than the case is worth; such a value reads as unavailable
 * here and as a number there.
 */
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

export function parseSourceNumber(text: string): number | undefined {
  if (text.length === 0 || text.length >= TEXT_SOURCE_CAPACITY) return undefined
  if (!DECIMAL_NUMBER.test(text)) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? deviceFloat(parsed) : undefined
}

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
    case 'text':
      return value.text === undefined ? undefined : parseSourceNumber(value.text)
    case 'float32':
      // The device holds this as a float and widens it to compare, so the
      // preview compares against the same value rather than a nearer one.
      return Number.isFinite(value.number) ? deviceFloat(value.number as number) : undefined
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
  const low = deviceFloat(minimum ?? 0)
  const high = deviceFloat(maximum ?? 1)
  const span = high - low
  if (!(span > 0)) return 0
  // The device hands back a float, and a window whose ends do not land on
  // one lands just short of full scale rather than on it.
  return deviceFloat(Math.min(Math.max((value - low) / span, 0), 1))
}
