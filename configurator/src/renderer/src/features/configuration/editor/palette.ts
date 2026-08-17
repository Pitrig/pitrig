import { type RgbColor } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'

/**
 * How many swatches a picker offers. Enough to cover a dashboard's real palette
 * — they run to a handful of accents plus their dimmed variants — without the
 * grid growing into something that has to be read rather than glanced at.
 */
export const MAXIMUM_PALETTE_SWATCHES = 18

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/**
 * Every colour the document already uses, most-used first.
 *
 * Found by walking the document for `#RRGGBB` strings rather than by naming the
 * properties that hold one. The sparse document has no other use for that
 * shape, and a walk cannot fall behind the schema the way a list of property
 * names would — a colour added to the contract shows up here for free. The
 * eight-digit transparent sentinel does not match, so "no background" never
 * becomes a swatch.
 */
function collect(configuration: DeviceConfiguration): RgbColor[] {
  const counts = new Map<string, number>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (!COLOR_PATTERN.test(value)) return
      // Authored case varies with how a colour was entered; a swatch grid that
      // showed #FFD400 and #ffd400 as two entries would be reporting on the
      // typing rather than on the dashboard.
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
    // Ties keep the order they were first seen in, which is document order, so
    // the grid is stable between edits instead of reshuffling under the cursor.
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAXIMUM_PALETTE_SWATCHES)
    .map(([color]) => color as RgbColor)
}

// The draft is replaced on every edit — once per frame while a widget is being
// dragged — and several colour fields are on screen at once. Keyed on the
// document's identity, so one walk serves all of them until the next edit.
let cache: { source: DeviceConfiguration; palette: readonly RgbColor[] } | undefined

export function dashboardPalette(
  configuration: DeviceConfiguration | undefined
): readonly RgbColor[] {
  if (!configuration) return []
  if (cache?.source === configuration) return cache.palette
  cache = { source: configuration, palette: collect(configuration) }
  return cache.palette
}
