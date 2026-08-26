import type { ValueTransform } from './configuration-schema'
import { parseSourceNumber, rawText, type TelemetryValue } from './telemetry-value'
import { MAXIMUM_TRANSFORM_DECIMALS } from './value-transform'
import { deviceFloat } from './contract-number'

const MAXIMUM_UNITS = 9.0e15

function formatDuration(milliseconds: number): string {
  const total = Math.trunc(milliseconds / 1000)
  const minutes = Math.trunc(total / 60)
  const seconds = total % 60
  const remainder = Math.trunc(milliseconds % 1000)
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(remainder, 3)}`
}

function formatSignedDuration(milliseconds: number): string {
  const magnitude = Math.abs(Math.trunc(milliseconds))
  return `${milliseconds < 0 ? '-' : '+'}${Math.trunc(magnitude / 1000)}.${pad(magnitude % 1000, 3)}`
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

const TEXT_CAPACITY = 64

const encoder = new TextEncoder()

function textBytes(text: string): number {
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
