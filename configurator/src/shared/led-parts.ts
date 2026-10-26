import { MAXIMUM_LED_PARTS, type LedPart } from './configuration-schema'

const SEPARATORS = /[\s,;]+/
const RUN = /^(\d+)(?:\s*[-–]\s*(\d+))?$/

export function partEnd(part: LedPart): number {
  return (part.from ?? 0) + (part.count ?? 1) - 1
}

export function partLamps(part: LedPart): number[] {
  const from = part.from ?? 0
  const count = Math.max(1, part.count ?? 1)
  const lamps = Array.from({ length: count }, (_, offset) => from + offset)
  return part.reversed ? lamps.reverse() : lamps
}

export function parseLamps(text: string, lamps: number): LedPart[] | undefined {
  const tokens = text.split(SEPARATORS).filter(Boolean)
  if (tokens.length === 0 || tokens.length > MAXIMUM_LED_PARTS) return undefined
  const parts: LedPart[] = []
  for (const token of tokens) {
    const match = RUN.exec(token)
    if (!match) return undefined
    const start = Number(match[1])
    const end = match[2] === undefined ? start : Number(match[2])
    if (start < 1 || end < 1 || start > lamps || end > lamps) return undefined
    const first = Math.min(start, end)
    parts.push({
      from: first - 1,
      count: Math.abs(end - start) + 1,
      ...(end < start ? { reversed: true } : {})
    })
  }
  return parts
}

export function formatLamps(parts: readonly LedPart[]): string {
  return parts
    .map((part) => {
      const first = (part.from ?? 0) + 1
      const last = partEnd(part) + 1
      if (first === last) return `${first}`
      return part.reversed ? `${last}-${first}` : `${first}-${last}`
    })
    .join(', ')
}

export function partsFromLamps(
  chosen: ReadonlySet<number>,
  previous: readonly LedPart[] = []
): LedPart[] {
  const sorted = [...chosen].sort((first, second) => first - second)
  const parts: LedPart[] = []
  for (const lamp of sorted) {
    const last = parts.at(-1)
    if (last && partEnd(last) === lamp - 1) last.count = (last.count ?? 1) + 1
    else parts.push({ from: lamp, count: 1 })
  }
  return parts.map((part) => {
    const kept = previous.find(
      (old) => (old.from ?? 0) <= (part.from ?? 0) && partEnd(old) >= (part.from ?? 0)
    )
    return kept?.reversed ? { ...part, reversed: true } : part
  })
}

export function mirroredParts(parts: readonly LedPart[], lamps: number): LedPart[] {
  const mirrored = parts.map((part) => ({
    from: lamps - 1 - partEnd(part),
    count: part.count ?? 1,
    ...(part.reversed ? {} : { reversed: true })
  }))
  const seen = new Set(parts.map((part) => `${part.from ?? 0}:${part.count ?? 1}`))
  const added = mirrored.filter((part) => !seen.has(`${part.from}:${part.count}`))
  return [...parts, ...added].slice(0, MAXIMUM_LED_PARTS)
}

export function wholeRun(lamps: number): LedPart[] {
  return lamps > 0 ? [{ from: 0, count: lamps }] : []
}

export function coversWhole(parts: readonly LedPart[], lamps: number): boolean {
  const only = parts[0]
  return parts.length === 1 && only !== undefined && (only.from ?? 0) === 0 &&
    (only.count ?? 1) >= lamps && !only.reversed
}
