import type { ValueTransform } from './configuration-schema'
import { parseSourceNumber, rawText, type TelemetryValue } from './telemetry-value'
import { MAXIMUM_TRANSFORM_DECIMALS } from './value-transform'
import { deviceFloat } from './contract-number'

// The device's presentation transforms, mirrored so the preview shows the
// string the board will draw rather than an approximation of it. The two rules
// worth stating, because they are where a naive port goes wrong:
//
//   * `number` rounds half **away from zero** on the scaled integer, the way
//     `firmware/utils/transformers/number_transform` does. `toFixed` does not:
//     it works on the binary double, so `(1.005).toFixed(2)` is `1.00` where the
//     board writes `1.01`.
//   * a transform that cannot accept a value returns nothing rather than
//     guessing. The firmware then draws the source's placeholder, and so does
//     the preview.

const MAXIMUM_UNITS = 9.0e15

/** `MM:SS.mmm`, minutes padded to two and never rolling over into hours. */
function formatDuration(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  const minutes = Math.trunc(total / 60)
  const seconds = total % 60
  const remainder = Math.trunc(milliseconds % 1000)
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(remainder, 3)}`
}

/** `±S.mmm`: the sign is always written, and the seconds are not padded. */
function formatSignedDuration(milliseconds: number): string {
  const magnitude = Math.abs(Math.trunc(milliseconds))
  return `${milliseconds < 0 ? '-' : '+'}${Math.trunc(magnitude / 1000)}.${pad(magnitude % 1000, 3)}`
}

function formatNumber(transform: ValueTransform, value: number): string | undefined {
  const decimals = transform.decimals ?? 0
  // `scale` and `offset` are `float` members of the device's Config, so the
  // document's doubles are narrowed to float32 before the arithmetic — the
  // multiplication itself is double on both sides. Skipping this is how the
  // preview and the board come to disagree by one: 1.8 is 1.7999999523 as a
  // float, so 1.8 × 65535 rounds to 117963 here and to 117962 there.
  const scale = deviceFloat(transform.scale ?? 1)
  const offset = deviceFloat(transform.offset ?? 0)
  if (decimals > MAXIMUM_TRANSFORM_DECIMALS) return undefined
  if (![value, scale, offset].every((entry) => Number.isFinite(entry))) return undefined
  const scaled = value * scale + offset
  const divisor = 10 ** decimals
  const units = scaled * divisor
  if (!Number.isFinite(units) || Math.abs(units) >= MAXIMUM_UNITS) return undefined
  // Half away from zero, on the scaled integer, exactly as the device rounds.
  const rounded = Math.trunc(units < 0 ? units - 0.5 : units + 0.5)
  const magnitude = Math.abs(rounded)
  const sign = rounded < 0 ? '-' : ''
  const whole = Math.trunc(magnitude / divisor)
  if (decimals === 0) return `${sign}${whole}`
  return `${sign}${whole}.${pad(magnitude % divisor, decimals)}`
}

/**
 * The body a source contributes, without its affixes. Undefined means the
 * transform refused the value — a time transform on a float, a number transform
 * on a boolean, or an unavailable source — and the caller falls back to the
 * placeholder, which is what the device draws.
 */
export function transformedBody(
  transform: ValueTransform | undefined,
  value: TelemetryValue
): string | undefined {
  if (!value.available) return undefined
  if (transform?.type === 'time') {
    // The device gates the two formats by type: a duration is unsigned, a delta
    // is signed, and neither accepts a float or a string.
    if (transform.format === 'signed_duration_ms') {
      return value.type === 'int32' && value.number !== undefined
        ? formatSignedDuration(value.number)
        : undefined
    }
    return value.type === 'uint32' && value.number !== undefined
      ? formatDuration(value.number)
      : undefined
  }
  if (transform?.type === 'number') {
    const numeric = numberFor(value)
    return numeric === undefined ? undefined : formatNumber(transform, numeric)
  }
  return rawText(value)
}

/**
 * What a source shows before its value arrives: its transform applied to zero.
 * The device builds the same string, so an empty dashboard and a stalled one
 * look alike.
 */
export function placeholderBody(transform: ValueTransform | undefined): string {
  if (transform?.type === 'time') {
    return transform.format === 'signed_duration_ms'
      ? formatSignedDuration(0)
      : formatDuration(0)
  }
  if (transform?.type === 'number') {
    return formatNumber(transform, 0) ?? '0'
  }
  return '0'
}

/** The buffer one widget's text is composed in, terminator included. */
const TEXT_CAPACITY = 64

const encoder = new TextEncoder()

/** The device measures its buffers in bytes, not in characters. */
function textBytes(text: string): number {
  return encoder.encode(text).byteLength
}

/**
 * Prefix and suffix belong to the transform, so they wrap whatever it produced —
 * unless the three together outgrow the buffer they are composed in. The device
 * refuses an append that would overflow rather than truncating, and then writes
 * the body on its own: the value outranks its decoration (`value_text::compose`).
 */
export function withAffixes(transform: ValueTransform | undefined, body: string): string {
  const decorated = `${transform?.prefix ?? ''}${body}${transform?.suffix ?? ''}`
  return textBytes(decorated) < TEXT_CAPACITY ? decorated : body
}

/**
 * One widget's label, out of what each of its sources contributed. All three
 * share the single buffer above, and the device stops at the first part that
 * would overflow it — dropping that part and the ones after it whole, rather
 * than cutting one in half. Three sources with generous affixes reach that
 * bound easily, and the canvas is the only place the author can see it happen.
 */
export function composeWidgetText(parts: readonly string[]): string {
  let composed = ''
  let used = 0
  for (const part of parts) {
    const bytes = textBytes(part)
    if (used + bytes >= TEXT_CAPACITY) break
    composed += part
    used += bytes
  }
  return composed
}

/**
 * A number transform reads numerics and parses text; a boolean it refuses.
 *
 * Narrowed to float32 wherever the device holds a float: its registry stores a
 * `float32` field as one, and its text parser produces one. A `uint32` and an
 * `int32` are widened exactly on both sides and are left alone.
 */
function numberFor(value: TelemetryValue): number | undefined {
  if (value.type === 'boolean') return undefined
  if (value.type === 'text') {
    return value.text === undefined ? undefined : parseSourceNumber(value.text)
  }
  if (value.type === 'float32') {
    return value.number === undefined ? undefined : deviceFloat(value.number)
  }
  return value.number
}

function pad(value: number, width: number): string {
  return String(Math.abs(Math.trunc(value))).padStart(width, '0')
}
