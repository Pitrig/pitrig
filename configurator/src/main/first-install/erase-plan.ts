import type { FlashPart } from './release-archive'

const SECTOR = 0x1000
const ERASE_BLOCK = 0x10000
const ERASE_CHUNK = 0x40000

export interface FlashRegion {
  offset: number
  size: number
}

export function erasePlan(
  parts: readonly FlashPart[],
  flashSize: number,
  chunk = ERASE_CHUNK
): FlashRegion[] {
  const covered = parts
    .map((part) => ({ start: alignDown(part.offset), end: alignUp(part.offset + part.data.length) }))
    .sort((left, right) => left.start - right.start)
  const regions: FlashRegion[] = []
  let cursor = 0
  for (const span of covered) {
    split(cursor, Math.min(span.start, flashSize), chunk, regions)
    cursor = Math.max(cursor, span.end)
  }
  split(cursor, flashSize, chunk, regions)
  return regions
}

function split(start: number, end: number, chunk: number, regions: FlashRegion[]): void {
  for (let offset = start; offset < end; ) {
    let next = Math.min(end, offset + chunk)
    if (next < end) next = Math.max(offset + SECTOR, next - (next % ERASE_BLOCK))
    regions.push({ offset, size: next - offset })
    offset = next
  }
}

function alignDown(value: number): number {
  return value - (value % SECTOR)
}

function alignUp(value: number): number {
  return Math.ceil(value / SECTOR) * SECTOR
}
