import type { ValueTransform } from './configuration-schema'
import { rawText, type TelemetryValue } from './telemetry-value'
import { MAXIMUM_TRANSFORM_DECIMALS } from './value-transform'

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
  const scale = transform.scale ?? 1
  const offset = transform.offset ?? 0
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

/** Prefix and suffix belong to the transform, so they wrap whatever it produced. */
export function withAffixes(transform: ValueTransform | undefined, body: string): string {
  return `${transform?.prefix ?? ''}${body}${transform?.suffix ?? ''}`
}

/** A number transform reads numerics and parses text; a boolean it refuses. */
function numberFor(value: TelemetryValue): number | undefined {
  if (value.type === 'boolean') return undefined
  if (value.type === 'text') {
    const text = value.text?.trim()
    if (!text) return undefined
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return value.number
}

function pad(value: number, width: number): string {
  return String(Math.abs(Math.trunc(value))).padStart(width, '0')
}
