import type { ValueTransform } from './configuration-schema'
import { parseSourceNumber, rawText, type TelemetryValue } from './telemetry-value'
import { MAXIMUM_TRANSFORM_DECIMALS } from './value-transform'
import { deviceFloat } from './contract-number'

const MAXIMUM_UNITS = 9.0e15
const SPLIT_TENTHS_BELOW_MINUTES = 10

function formatDuration(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  const minutes = Math.trunc(total / 60)
  const seconds = total % 60
  const remainder = Math.trunc(milliseconds % 1000)
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(remainder, 3)}`
}

function formatClock(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  return `${pad(Math.trunc(total / 3600), 2)}:${pad(Math.trunc(total / 60) % 60, 2)}:${pad(total % 60, 2)}`
}

function formatSignedDuration(milliseconds: number): string {
  const magnitude = Math.abs(Math.trunc(milliseconds))
  return `${milliseconds < 0 ? '-' : '+'}${Math.trunc(magnitude / 1000)}.${pad(magnitude % 1000, 3)}`
}

function formatCompactDuration(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  const minutes = Math.trunc(total / 60)
  const remainder = pad(Math.trunc(milliseconds % 1000), 3)
  return minutes === 0 ? `${total}.${remainder}` : `${minutes}:${pad(total % 60, 2)}.${remainder}`
}

function formatSplit(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  const minutes = Math.trunc(total / 60)
  if (minutes === 0) return `${total}.${pad(Math.trunc(milliseconds % 1000), 3)}`
  const clock = `${minutes}:${pad(total % 60, 2)}`
  return minutes < SPLIT_TENTHS_BELOW_MINUTES ? `${clock}.${Math.trunc((milliseconds % 1000) / 100)}` : clock
}

function formatCompactClock(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  const hours = Math.trunc(total / 3600)
  if (hours === 0) return `${Math.trunc(total / 60)}:${pad(total % 60, 2)}`
  return `${hours}:${pad(Math.trunc(total / 60) % 60, 2)}:${pad(total % 60, 2)}`
}

const DIGIT_LIMIT = 10_000
const DIGIT_STEPS: readonly { unitMs: number; decimals: number }[] = [
  { unitMs: 1, decimals: 3 },
  { unitMs: 10, decimals: 2 },
  { unitMs: 100, decimals: 1 },
  { unitMs: 1000, decimals: 0 }
]

function formatSignedDigits(milliseconds: number): string {
  const magnitude = Math.abs(Math.trunc(milliseconds))
  const sign = milliseconds < 0 ? '-' : '+'
  for (const { unitMs, decimals } of DIGIT_STEPS) {
    const units = Math.trunc((magnitude + Math.trunc(unitMs / 2)) / unitMs)
    if (units >= DIGIT_LIMIT) continue
    if (decimals === 0) return `${sign}${units}`
    const divisor = 10 ** decimals
    return `${sign}${Math.trunc(units / divisor)}.${pad(units % divisor, decimals)}`
  }
  return `${sign}${DIGIT_LIMIT - 1}`
}

const SIGNED_TIME_FORMATS: ReadonlySet<string> = new Set(['signed_duration_ms', 'signed_digits_ms'])

export function isSignedTimeFormat(format: string | undefined): boolean {
  return format !== undefined && SIGNED_TIME_FORMATS.has(format)
}

function formatTime(format: string | undefined, milliseconds: number): string {
  switch (format) {
    case 'signed_duration_ms':
      return formatSignedDuration(milliseconds)
    case 'signed_digits_ms':
      return formatSignedDigits(milliseconds)
    case 'clock_ms':
      return formatClock(milliseconds)
    case 'compact_duration_ms':
      return formatCompactDuration(milliseconds)
    case 'compact_clock_ms':
      return formatCompactClock(milliseconds)
    case 'split_ms':
      return formatSplit(milliseconds)
    default:
      return formatDuration(milliseconds)
  }
}

function formatNumber(transform: ValueTransform, value: number): string | undefined {
  const decimals = transform.decimals ?? 0
  const scale = deviceFloat(transform.scale ?? 1)
  const offset = deviceFloat(transform.offset ?? 0)
  if (decimals > MAXIMUM_TRANSFORM_DECIMALS) return undefined
  if (![value, scale, offset].every((entry) => Number.isFinite(entry))) return undefined
  const scaled = value * scale + offset
  const divisor = 10 ** decimals
  const units = scaled * divisor
  if (!Number.isFinite(units) || Math.abs(units) >= MAXIMUM_UNITS) return undefined
  const rounded = Math.trunc(units < 0 ? units - 0.5 : units + 0.5)
  const magnitude = Math.abs(rounded)
  const sign = rounded < 0 ? '-' : ''
  const whole = Math.trunc(magnitude / divisor)
  if (decimals === 0) return `${sign}${whole}`
  return `${sign}${whole}.${pad(magnitude % divisor, decimals)}`
}

export function transformedBody(
  transform: ValueTransform | undefined,
  value: TelemetryValue
): string | undefined {
  if (!value.available) return undefined
  if (transform?.type === 'time') {
    const expected = isSignedTimeFormat(transform.format) ? 'int32' : 'uint32'
    if (value.type !== expected || value.number === undefined) return undefined
    return formatTime(transform.format, value.number)
  }
  if (transform?.type === 'number') {
    const numeric = numberFor(value)
    return numeric === undefined ? undefined : formatNumber(transform, numeric)
  }
  return rawText(value)
}

export function placeholderBody(transform: ValueTransform | undefined): string {
  if (transform?.type === 'time') return formatTime(transform.format, 0)
  if (transform?.type === 'number') {
    return formatNumber(transform, 0) ?? '0'
  }
  return '0'
}

const TEXT_CAPACITY = 64

const encoder = new TextEncoder()

export function textBytes(text: string): number {
  return encoder.encode(text).byteLength
}

export function withAffixes(transform: ValueTransform | undefined, body: string): string {
  const decorated = `${transform?.prefix ?? ''}${body}${transform?.suffix ?? ''}`
  return textBytes(decorated) < TEXT_CAPACITY ? decorated : body
}

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
