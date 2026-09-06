import {
  TELEMETRY_SLOT_COUNT,
  slotOfWireId,
  slotType,
  type TelemetrySnapshot
} from '@shared/telemetry-bridge'
import { parseSourceNumber } from '@shared/telemetry-value'

const MAXIMUM_LINE_LENGTH = 127
const MAXIMUM_VALUE_LENGTH = 63
const MAXIMUM_WIRE_ID_LENGTH = 2
const UNSIGNED_INTEGER = /^\d+$/
const SIGNED_INTEGER = /^[+-]?\d+$/

export interface DecodeCounts {
  lines: number
  fields: number
  unknown: number
}

export class TelemetryTap {
  private readonly available = new Uint8Array(TELEMETRY_SLOT_COUNT)
  private readonly numbers = new Float64Array(TELEMETRY_SLOT_COUNT)
  private readonly texts = new Array<string | null>(TELEMETRY_SLOT_COUNT).fill(null)
  private pending = ''
  private revision = 0
  private changed = false

  get dirty(): boolean {
    return this.changed
  }

  reset(): void {
    this.available.fill(0)
    this.numbers.fill(0)
    this.texts.fill(null)
    this.pending = ''
    this.revision += 1
    this.changed = true
  }

  consume(chunk: string): DecodeCounts {
    const counts: DecodeCounts = { lines: 0, fields: 0, unknown: 0 }
    let start = 0
    const text = this.pending.length === 0 ? chunk : this.pending + chunk
    this.pending = ''
    for (;;) {
      const end = text.indexOf('\n', start)
      if (end < 0) break
      const stop = end > start && text.charCodeAt(end - 1) === 13 ? end - 1 : end
      counts.lines += 1
      if (this.decode(text, start, stop)) counts.fields += 1
      else counts.unknown += 1
      start = end + 1
    }
    const rest = text.length - start
    if (rest > 0) {
      this.pending = rest > MAXIMUM_LINE_LENGTH ? '' : text.slice(start)
    }
    if (counts.fields > 0) this.revision += 1
    return counts
  }

  snapshot(): TelemetrySnapshot {
    this.changed = false
    return {
      revision: this.revision,
      available: this.available,
      numbers: this.numbers,
      texts: this.texts
    }
  }

  private decode(text: string, start: number, stop: number): boolean {
    if (stop - start > MAXIMUM_LINE_LENGTH) return false
    const separator = text.indexOf(';', start)
    if (separator < 0 || separator >= stop) return false
    const idLength = separator - start
    if (idLength <= 0 || idLength > MAXIMUM_WIRE_ID_LENGTH) return false
    const slot = slotOfWireId(text.slice(start, separator))
    if (slot === undefined) return false
    const value = text.slice(separator + 1, stop)
    if (value.length > MAXIMUM_VALUE_LENGTH) return false
    if (value.length === 0) {
      this.invalidate(slot)
      return true
    }
    return this.store(slot, value)
  }

  private invalidate(slot: number): void {
    if (this.available[slot] === 0) return
    this.available[slot] = 0
    this.texts[slot] = null
    this.changed = true
  }

  private store(slot: number, value: string): boolean {
    const type = slotType(slot)
    if (type === 'text') return this.commit(slot, value, 0)
    const numeric = decodeNumber(type, value)
    if (numeric === undefined) return false
    return this.commit(slot, type === 'boolean' ? booleanText(numeric) : value, numeric)
  }

  private commit(slot: number, text: string, numeric: number): boolean {
    if (this.available[slot] === 1 && this.texts[slot] === text) return true
    this.available[slot] = 1
    this.texts[slot] = text
    this.numbers[slot] = numeric
    this.changed = true
    return true
  }
}

function booleanText(numeric: number): string {
  return numeric === 1 ? 'true' : 'false'
}

function decodeNumber(type: string, value: string): number | undefined {
  switch (type) {
    case 'uint32':
      return UNSIGNED_INTEGER.test(value) ? Number(value) : undefined
    case 'int32':
      return SIGNED_INTEGER.test(value) ? Number(value) : undefined
    case 'boolean':
      return value === '1' || value === 'true'
        ? 1
        : value === '0' || value === 'false'
          ? 0
          : undefined
    default:
      return parseSourceNumber(value)
  }
}
