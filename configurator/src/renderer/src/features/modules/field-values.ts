import { FIELD_RANGES } from '@shared/configuration-schema'

export function wholeValue(owner: string, key: string, value: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0
  const range = FIELD_RANGES[owner]?.find((entry) => entry.key === key)
  if (!range) return rounded
  if (range.zeroMeansOff && rounded <= 0) return 0
  return Math.min(Math.max(rounded, range.minimum), range.maximum)
}
