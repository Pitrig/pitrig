import { FIELD_RANGES } from '@shared/configuration-schema'

function maximumOf(owner: string, key: string): number | undefined {
  return FIELD_RANGES[owner]?.find((entry) => entry.key === key)?.maximum
}

export function percentValue(owner: string, key: string, value: number): number {
  const maximum = maximumOf(owner, key)
  return maximum ? Math.round((value * 100) / maximum) : value
}

export function fromPercent(owner: string, key: string, percent: number): number {
  const maximum = maximumOf(owner, key)
  return wholeValue(owner, key, maximum ? (percent * maximum) / 100 : percent)
}

export function wholeValue(owner: string, key: string, value: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0
  const range = FIELD_RANGES[owner]?.find((entry) => entry.key === key)
  if (!range) return rounded
  if (range.zeroMeansOff && rounded <= 0) return 0
  return Math.min(Math.max(rounded, range.minimum), range.maximum)
}
