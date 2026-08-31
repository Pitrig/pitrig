import { FIELD_RANGES, type FieldRange } from '../configuration-schema'
import { pagesOf, screensOf, widgetsOf, type WidgetParent } from '../configuration-access'
import type { ApplicationConfiguration, WidgetConfiguration } from '../configuration-schema'

const SLOT_PAGE_RANGES = 'SlotPageConfiguration'
const WIDGET_CONDITION_RANGES = 'WidgetCondition'

function read(source: unknown, key: string): unknown {
  let value = source
  for (const step of key.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined
    value = (value as Record<string, unknown>)[step]
  }
  return value
}

function findBoundError(
  source: unknown,
  ranges: readonly FieldRange[] | undefined,
  owner: string
): string | undefined {
  for (const range of ranges ?? []) {
    const value = read(source, range.key)
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${owner} sets "${range.key}" to something that is not a number.`
    }
    if (range.zeroMeansOff && value === 0) continue
    if (value < range.minimum || value > range.maximum) {
      return `${owner} sets "${range.key}" to ${value}; the device accepts ${describe(range)}.`
    }
  }
  return undefined
}

function describe(range: FieldRange): string {
  const window = `${range.minimum} to ${range.maximum}`
  return range.zeroMeansOff ? `0 or ${window}` : window
}

function findWidgetError(widget: WidgetConfiguration): string | undefined {
  const label = `Widget "${widget.id ?? ''}"`
  const error = findBoundError(widget, FIELD_RANGES[widget.type], label)
  if (error) return error
  const rules = (widget as { conditions?: unknown }).conditions
  if (Array.isArray(rules)) {
    for (const [index, rule] of rules.entries()) {
      const error = findBoundError(rule, FIELD_RANGES[WIDGET_CONDITION_RANGES], `Rule ${index + 1} of ${label}`)
      if (error) return error
    }
  }
  if (widget.type !== 'slot') return undefined
  for (const [index, page] of pagesOf(widget).entries()) {
    const error = findBoundError(page, FIELD_RANGES[SLOT_PAGE_RANGES], `Page ${index + 1} of ${label}`)
    if (error) return error
  }
  return undefined
}

export function fieldBounds(owner: string, key: string): { min?: number; max?: number } {
  const range = FIELD_RANGES[owner]?.find((entry) => entry.key === key)
  if (!range) return {}
  return { min: range.zeroMeansOff ? 0 : range.minimum, max: range.maximum }
}

export function findRangeError(
  configuration: ApplicationConfiguration
): string | undefined {
  const walk = (parent: WidgetParent): string | undefined => {
    for (const widget of widgetsOf(parent)) {
      const error = findWidgetError(widget)
      if (error) return error
      if (widget.type === 'shape') {
        const nested = walk(widget)
        if (nested) return nested
        continue
      }
      if (widget.type !== 'slot') continue
      for (const page of pagesOf(widget)) {
        const nested = walk(page)
        if (nested) return nested
      }
    }
    return undefined
  }
  for (const screen of screensOf(configuration)) {
    const error = walk(screen)
    if (error) return error
  }
  return undefined
}
