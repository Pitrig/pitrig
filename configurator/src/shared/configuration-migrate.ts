import { createWidgetId } from './configuration-access'

const LEGACY_SLOT_KEYS = [
  'slot',
  'slot_default',
  'slot_source',
  'slot_conditions'
] as const

const LEGACY_SOURCE_KEYS = ['binding', 'modifiers', 'transform'] as const

const LAP_DELTA_BINDING = 'session.lap.delta'

const DEFAULT_FASTER_COLOR = '#00C853'
const DEFAULT_SLOWER_COLOR = '#D50000'
const DEFAULT_NEUTRAL_COLOR = '#E8E8E8'
const DEFAULT_SCALE_RANGE_MS = 2000

export function migrateConfigurationDocument(document: unknown): unknown {
  if (!isObject(document)) return document
  if (Array.isArray(document.hardware)) {
    for (const device of document.hardware) {
      if (!isObject(device) || !Array.isArray(device.effects)) continue
      for (const effect of device.effects) {
        if (isObject(effect)) delete effect.brightness
      }
    }
  }
  const module = isObject(document.delta_time) ? document.delta_time : undefined
  const dashboard = document.dashboard
  if (isObject(dashboard) && Array.isArray(dashboard.screens)) {
    for (const screen of dashboard.screens) {
      if (!isObject(screen) || !Array.isArray(screen.widgets)) continue
      for (const widget of screen.widgets) migrateTextWidget(widget)
      const widgets = screen.widgets.flatMap((widget) =>
        migrateDeltaTimeWidget(widget, module)
      )
      for (const widget of widgets) dropLegacySlot(widget)
      screen.widgets = widgets
    }
  }
  delete document.delta_time
  return document
}

function migrateTextWidget(widget: unknown): void {
  if (!isObject(widget) || widget.type !== 'text' || widget.sources !== undefined) return
  const source: Record<string, unknown> = {}
  for (const key of LEGACY_SOURCE_KEYS) {
    if (widget[key] === undefined) continue
    source[key] = widget[key]
    delete widget[key]
  }
  widget.sources = [source]
}

function dropLegacySlot(widget: unknown): void {
  if (!isObject(widget)) return
  for (const key of LEGACY_SLOT_KEYS) delete widget[key]
  if (Array.isArray(widget.widgets)) {
    for (const child of widget.widgets) dropLegacySlot(child)
  }
}

function migrateDeltaTimeWidget(
  widget: unknown,
  module: Record<string, unknown> | undefined
): unknown[] {
  if (!isObject(widget) || widget.type !== 'delta_time') return [widget]

  const zIndex = typeof widget.z_index === 'number' ? widget.z_index : 0
  const moduleScale = isObject(module?.scale) ? module.scale : undefined
  const widgetScale = isObject(widget.scale) ? widget.scale : undefined
  const replacements: unknown[] = []

  if (moduleScale?.enabled === true) {
    const rangeMs =
      typeof moduleScale.range_ms === 'number' && moduleScale.range_ms > 0
        ? moduleScale.range_ms
        : DEFAULT_SCALE_RANGE_MS
    replacements.push({
      type: 'bar',
      id: createWidgetId(),
      placement: widget.placement,
      z_index: zIndex,
      source: { binding: LAP_DELTA_BINDING },
      minimum: -rangeMs,
      maximum: rangeMs,
      origin: 0,
      fill_color: colorOr(widget.neutral_color, DEFAULT_NEUTRAL_COLOR),
      ...(widgetScale
        ? {
            border: {
              ...(typeof widgetScale.border_width_px === 'number'
                ? { width_px: widgetScale.border_width_px }
                : {}),
              ...(typeof widgetScale.border_radius_px === 'number'
                ? { radius_px: widgetScale.border_radius_px }
                : {}),
              color: colorOr(widget.neutral_color, DEFAULT_NEUTRAL_COLOR)
            }
          }
        : {})
    })
  }

  replacements.push({
    type: 'text',
    ...(typeof widget.id === 'string' ? { id: widget.id } : {}),
    placement: widget.placement,
    z_index: replacements.length > 0 ? zIndex + 1 : zIndex,
    sources: [
      {
        binding: LAP_DELTA_BINDING,
        transform: { type: 'time', format: 'signed_duration_ms' }
      }
    ],
    value: {
      ...(widget.font !== undefined ? { font: widget.font } : {}),
      color: colorOr(widget.neutral_color, DEFAULT_NEUTRAL_COLOR),
      ...unavailableText(module)
    },
    condition_source: { binding: LAP_DELTA_BINDING },
    conditions: [
      { op: 'below', value: 0, color: colorOr(widget.faster_color, DEFAULT_FASTER_COLOR) },
      { op: 'above', value: 0, color: colorOr(widget.slower_color, DEFAULT_SLOWER_COLOR) }
    ]
  })

  return replacements
}

function unavailableText(
  module: Record<string, unknown> | undefined
): { unavailable_text?: string } {
  const behavior = module?.unavailable_behavior
  if (behavior === 'hide') return { unavailable_text: '' }
  if (behavior === 'placeholder') {
    return { unavailable_text: typeof module?.placeholder === 'string' ? module.placeholder : '---' }
  }
  return {}
}

function colorOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
