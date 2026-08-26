import { type RgbColor } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'

const MAXIMUM_PALETTE_SWATCHES = 18

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

function collect(configuration: DeviceConfiguration): RgbColor[] {
  const counts = new Map<string, number>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (!COLOR_PATTERN.test(value)) return
      const key = value.toUpperCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const entry of Object.values(value)) visit(entry)
    }
  }
  visit(configuration)
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAXIMUM_PALETTE_SWATCHES)
    .map(([color]) => color as RgbColor)
}

let cache: { source: DeviceConfiguration; palette: readonly RgbColor[] } | undefined

export function dashboardPalette(
  configuration: DeviceConfiguration | undefined
): readonly RgbColor[] {
  if (!configuration) return []
  if (cache?.source === configuration) return cache.palette
  cache = { source: configuration, palette: collect(configuration) }
  return cache.palette
}
