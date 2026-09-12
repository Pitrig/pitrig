import { FIELD_RANGES, WIDGET_TYPES, type FieldRange } from '../configuration-schema'
import { pagesOf, screensOf, widgetsOf, type WidgetParent } from '../configuration-access'
import type { ApplicationConfiguration, WidgetConfiguration } from '../configuration-schema'
import { t } from '../ui-text'

const SLOT_PAGE_RANGES = 'SlotPageConfiguration'
const WIDGET_CONDITION_RANGES = 'WidgetCondition'

const INT16 = { minimum: -32768, maximum: 32767 }
const INT32 = { minimum: -2147483648, maximum: 2147483647 }
const UINT8 = { minimum: 0, maximum: 255 }
const UINT16 = { minimum: 0, maximum: 65535 }

const FRAME_STORAGE: readonly FieldRange[] = [
  { key: 'placement.x', ...INT32 },
  { key: 'placement.y', ...INT32 },
  { key: 'placement.width', ...INT32 },
  { key: 'placement.height', ...INT32 },
  { key: 'z_index', ...INT16 },
  { key: 'padding.left', ...UINT16 },
  { key: 'padding.top', ...UINT16 },
  { key: 'padding.right', ...UINT16 },
  { key: 'padding.bottom', ...UINT16 },
  { key: 'background_inset_px', ...UINT16 },
  { key: 'title.offset_x_px', ...INT16 },
  { key: 'title.offset_y_px', ...INT16 }
]

const OWNER_STORAGE: Record<string, readonly FieldRange[]> = {
  indicator: [
    { key: 'segment_gap_px', ...UINT16 },
    { key: 'segment_radius_px', ...UINT16 }
  ],
  image: [{ key: 'recolor_opa', ...UINT8 }]
}

function rangesOf(owner: string): readonly FieldRange[] {
  return [
    ...(FIELD_RANGES[owner] ?? []),
    ...(WIDGET_TYPES.includes(owner) ? FRAME_STORAGE : []),
    ...(OWNER_STORAGE[owner] ?? [])
  ]
}

function read(source: unknown, key: string): unknown {
  let value = source
  for (const step of key.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined
    value = (value as Record<string, unknown>)[step]
  }
  return value
}

export function findBoundError(
  source: unknown,
  ranges: readonly FieldRange[] | undefined,
  owner: string
): string | undefined {
  for (const range of ranges ?? []) {
    const value = read(source, range.key)
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return t('validation.ranges.ownerSetsKeyToSomething', { owner: owner, key: range.key })
    }
    if (!Number.isInteger(value)) {
      return t('validation.ranges.ownerSetsKeyToValue', { owner: owner, key: range.key, value: value, range: describe(range) })
    }
    if (range.zeroMeansOff && value === 0) continue
    if (value < range.minimum || value > range.maximum) {
      return t('validation.ranges.ownerSetsKeyToValue', { owner: owner, key: range.key, value: value, range: describe(range) })
    }
  }
  return undefined
}

function describe(range: FieldRange): string {
  const window = t('validation.ranges.minimumToMaximum', { minimum: range.minimum, maximum: range.maximum })
  return range.zeroMeansOff ? t('validation.ranges.text0OrWindow', { window: window }) : window
}

function findWidgetError(widget: WidgetConfiguration): string | undefined {
  const label = `Widget "${widget.id ?? ''}"`
  const error = findBoundError(widget, rangesOf(widget.type), label)
  if (error) return error
  const rules = (widget as { conditions?: unknown }).conditions
  if (Array.isArray(rules)) {
    for (const [index, rule] of rules.entries()) {
      const error = findBoundError(
        rule,
        FIELD_RANGES[WIDGET_CONDITION_RANGES],
        t('validation.ranges.ruleOfLabel', { number: index + 1, label })
      )
      if (error) return error
    }
  }
  if (widget.type !== 'slot') return undefined
  for (const [index, page] of pagesOf(widget).entries()) {
    const error = findBoundError(
      page,
      FIELD_RANGES[SLOT_PAGE_RANGES],
      t('validation.ranges.pageOfLabel', { number: index + 1, label })
    )
    if (error) return error
  }
  return undefined
}

export function fieldBounds(owner: string, key: string): { min?: number; max?: number } {
  const range = rangesOf(owner).find((entry) => entry.key === key)
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
