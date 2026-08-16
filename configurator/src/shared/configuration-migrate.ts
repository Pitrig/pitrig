// Documents outlive schema versions, so every document entering the
// configurator — project file or device payload — is brought forward here
// instead of at each call site. Migration mutates the document it is given,
// which is always one the caller has just parsed.
//
// Schema 3 → 4: a text widget carried one `binding` with its `modifiers` and
// `transform` at the widget level; the ordered `sources` array replaced them.
//
// Schema 4 → 5: the `delta_time` widget and its module section were removed.
// A lap delta is telemetry like any other, so the widget is rebuilt out of the
// primitives that were always underneath it: a text widget reading
// `session.lap.delta` through the signed duration transform, plus a bar for the
// scale it used to draw itself.

import { createWidgetId } from './configuration-access'

const LEGACY_SOURCE_KEYS = ['binding', 'modifiers', 'transform'] as const

/** The field the Delta Time module read, and the only one this widget showed. */
const LAP_DELTA_BINDING = 'session.lap.delta'

const DEFAULT_FASTER_COLOR = '#00C853'
const DEFAULT_SLOWER_COLOR = '#D50000'
const DEFAULT_NEUTRAL_COLOR = '#E8E8E8'
const DEFAULT_SCALE_RANGE_MS = 2000

export function migrateConfigurationDocument(document: unknown): unknown {
  if (!isObject(document)) return document
  const module = isObject(document.delta_time) ? document.delta_time : undefined
  const dashboard = document.dashboard
  if (isObject(dashboard) && Array.isArray(dashboard.screens)) {
    for (const screen of dashboard.screens) {
      if (!isObject(screen) || !Array.isArray(screen.widgets)) continue
      for (const widget of screen.widgets) migrateTextWidget(widget)
      screen.widgets = screen.widgets.flatMap((widget) =>
        migrateDeltaTimeWidget(widget, module)
      )
    }
  }
  // The module section has no consumer left, and leaving it would fail
  // validation as an unknown property.
  delete document.delta_time
  return document
}

/**
 * Every schema-3 text widget had exactly one source, so one is always written —
 * a widget that named no binding was relying on the schema default and keeps
 * relying on it.
 */
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

/**
 * Expands one delta_time widget into the widgets that reproduce it. The scale
 * becomes a bar centred on zero — which is what `origin` exists for — and the
 * reading becomes a text widget above it, so the pair keeps the z-order the
 * single widget had. Any other widget passes through untouched.
 */
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
      // The old scale filled outwards from the centre, which is exactly a zero
      // origin on a symmetric window.
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
    // Selection, and anything else addressing this widget, follows the reading
    // rather than the scale, so the reading keeps the original id.
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
    // The tone model was three fixed colours around zero, which is two rules
    // over the same field the widget already read.
    condition_source: { binding: LAP_DELTA_BINDING },
    conditions: [
      { op: 'below', value: 0, color: colorOr(widget.faster_color, DEFAULT_FASTER_COLOR) },
      { op: 'above', value: 0, color: colorOr(widget.slower_color, DEFAULT_SLOWER_COLOR) }
    ]
  })

  return replacements
}

/**
 * `zero` was the schema default and matches what a text widget already does
 * with an absent source, so only the other two behaviours write anything.
 */
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
