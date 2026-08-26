import {
  BAR_ORIENTATION_VALUES,
  COLOR_RAMP_TARGET_VALUES,
  CONDITION_OPERATOR_VALUES,
  GRADIENT_DIRECTION_VALUES,
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_GRAPH_SOURCES,
  MAXIMUM_GRAPH_TRACES,
  MAXIMUM_INDICATOR_SEGMENTS,
  MAXIMUM_TEXT_SOURCES,
  MAXIMUM_WIDGET_CONDITIONS,
  SHAPE_KIND_VALUES,
  TEXT_ALIGNMENT_VALUES,
  type WidgetConfiguration
} from '../configuration-schema'
import { isTextWidget } from '../configuration-access'
import { IMAGE_ID_PATTERN } from '../image-assets'
import { TELEMETRY_CATALOG } from '../telemetry-catalog'
import { transformError } from './transforms'

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const BINDINGS: ReadonlySet<string> = new Set<string>(TELEMETRY_CATALOG.map(({ name }) => name))

function findColorError(widget: WidgetConfiguration, label: string): string | undefined {
  let error: string | undefined
  const walk = (value: unknown, path: string): void => {
    if (error || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`))
      return
    }
    for (const [key, entry] of Object.entries(value)) {
      if (error) return
      if (key === 'widgets' || key === 'pages') continue
      if (key === 'color' || key.endsWith('_color')) {
        if (typeof entry !== 'string' || !COLOR_PATTERN.test(entry)) {
          error = `${label} sets "${path ? `${path}.` : ''}${key}" to ${JSON.stringify(entry)}; a colour is "#RRGGBB".`
          return
        }
        continue
      }
      walk(entry, path ? `${path}.${key}` : key)
    }
  }
  walk(widget, '')
  return error
}

function badEnum(
  value: unknown,
  values: readonly string[],
  label: string,
  key: string
): string | undefined {
  if (value === undefined) return undefined
  return values.includes(value as string)
    ? undefined
    : `${label} sets "${key}" to ${JSON.stringify(value)}; the device knows ${values.join(', ')}.`
}

function findEnumError(widget: WidgetConfiguration, label: string): string | undefined {
  const frame = widget as unknown as {
    background_grad_dir?: string
    title?: { alignment?: string }
    conditions?: { op?: string }[]
    color_ramp?: { target?: string }
  }
  const checks: (string | undefined)[] = [
    badEnum(frame.background_grad_dir, GRADIENT_DIRECTION_VALUES, label, 'background_grad_dir'),
    badEnum(frame.title?.alignment, TEXT_ALIGNMENT_VALUES, label, 'title.alignment'),
    badEnum(frame.color_ramp?.target, COLOR_RAMP_TARGET_VALUES, label, 'color_ramp.target'),
    isTextWidget(widget)
      ? badEnum(widget.value?.alignment, TEXT_ALIGNMENT_VALUES, label, 'value.alignment')
      : undefined,
    widget.type === 'shape' ? badEnum(widget.kind, SHAPE_KIND_VALUES, label, 'kind') : undefined,
    widget.type === 'bar' || widget.type === 'indicator'
      ? badEnum(widget.orientation, BAR_ORIENTATION_VALUES, label, 'orientation')
      : undefined
  ]
  for (const [index, rule] of (frame.conditions ?? []).entries()) {
    checks.push(badEnum(rule?.op, CONDITION_OPERATOR_VALUES, label, `conditions[${index}].op`))
  }
  return checks.find((entry) => entry !== undefined)
}

function bindingError(
  binding: string | undefined,
  fallback: string,
  label: string,
  what: string
): string | undefined {
  const name = binding ?? fallback
  if (BINDINGS.has(name)) return undefined
  return name === ''
    ? `${what} of ${label} has no telemetry field.`
    : `${what} of ${label} reads "${name}", which is not a telemetry field.`
}

function rangeError(
  widget: { minimum?: number; maximum?: number },
  label: string,
  what: string
): string | undefined {
  const minimum = widget.minimum ?? 0
  const maximum = widget.maximum ?? 1
  if (Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum) return undefined
  return `${what} of ${label} runs ${minimum} to ${maximum}; the device needs a maximum above the minimum.`
}

function findSourceError(widget: WidgetConfiguration, label: string): string | undefined {
  if (isTextWidget(widget)) {
    const sources = widget.sources ?? []
    if (sources.length === 0) return `${label} has no source, so it would render nothing.`
    if (sources.length > MAXIMUM_TEXT_SOURCES) {
      return `${label} composes ${sources.length} sources; the device composes ${MAXIMUM_TEXT_SOURCES}.`
    }
    for (const [index, source] of sources.entries()) {
      const what = `Source ${index + 1}`
      const error = bindingError(source?.binding, 'vehicle.speed', label, what)
      if (error) return error
      const mismatch = transformError(
        source?.transform,
        source?.binding ?? 'vehicle.speed',
        label,
        `The transform on source ${index + 1}`
      )
      if (mismatch) return mismatch
    }
    return undefined
  }
  if (widget.type === 'bar' || widget.type === 'arc' || widget.type === 'indicator' || widget.type === 'graph') {
    const error = bindingError(widget.source?.binding, '', label, 'The source')
    if (error) return error
    const window = rangeError(widget, label, 'The value window')
    if (window) return window
  }
  if (widget.type === 'graph') {
    const traces = widget.traces ?? []
    if (traces.length > MAXIMUM_GRAPH_TRACES) {
      return `${label} draws ${traces.length + 1} sources; the device draws ${MAXIMUM_GRAPH_SOURCES}.`
    }
    for (const [index, trace] of traces.entries()) {
      const error = bindingError(trace?.source?.binding, '', label, `Trace ${index + 1}`)
      if (error) return error
      const window = rangeError(trace ?? {}, label, `The window of trace ${index + 1}`)
      if (window) return window
    }
  }
  if (widget.type === 'image') {
    const image = widget.image ?? ''
    if (image !== '' && !IMAGE_ID_PATTERN.test(image)) {
      return `${label} names the image "${image}", which is not an image identifier.`
    }
    if (widget.sprite_frame_source) {
      const error = bindingError(widget.sprite_frame_source.binding, '', label, 'The sprite frame source')
      if (error) return error
    }
  }
  return undefined
}

function findConditionError(widget: WidgetConfiguration, label: string): string | undefined {
  const rules = widget.conditions ?? []
  const stops = widget.color_ramp?.stops ?? []
  if (rules.length > MAXIMUM_WIDGET_CONDITIONS) {
    return `${label} has ${rules.length} styling rules; the device holds ${MAXIMUM_WIDGET_CONDITIONS}.`
  }
  if (stops.length === 1) {
    return `${label} has a colour ramp with one stop; a ramp interpolates between two.`
  }
  if (stops.length > MAXIMUM_COLOR_STOPS) {
    return `${label} has a colour ramp with ${stops.length} stops; the device holds ${MAXIMUM_COLOR_STOPS}.`
  }
  let previous = Number.NEGATIVE_INFINITY
  for (const [index, stop] of stops.entries()) {
    const at = stop?.at ?? 0
    if (!Number.isFinite(at) || at <= previous) {
      return `${label} has a colour ramp whose stop ${index + 1} does not climb past the one before it.`
    }
    previous = at
  }
  for (const [index, rule] of rules.entries()) {
    if (!Number.isFinite(rule?.value ?? 0)) {
      return `Rule ${index + 1} of ${label} compares against something that is not a number.`
    }
  }
  if (rules.length === 0 && stops.length === 0) return undefined
  return bindingError(widget.condition_source?.binding, '', label, 'The watched source')
}

function findSegmentError(widget: WidgetConfiguration, label: string): string | undefined {
  if (widget.type !== 'indicator') return undefined
  const segments = widget.segments ?? []
  if (segments.length === 0) return `${label} has no segments, so nothing would light.`
  if (segments.length > MAXIMUM_INDICATOR_SEGMENTS) {
    return `${label} has ${segments.length} segments; the device holds ${MAXIMUM_INDICATOR_SEGMENTS}.`
  }
  let previous = Number.NEGATIVE_INFINITY
  for (const [index, segment] of segments.entries()) {
    const threshold = segment?.threshold ?? 0
    if (!Number.isFinite(threshold) || threshold < previous) {
      return `${label} has segment ${index + 1} below the one before it; thresholds climb.`
    }
    previous = threshold
  }
  return undefined
}

export function findWidgetValueError(
  widget: WidgetConfiguration,
  label: string
): string | undefined {
  return (
    findColorError(widget, label) ??
    findEnumError(widget, label) ??
    findSourceError(widget, label) ??
    findConditionError(widget, label) ??
    findSegmentError(widget, label)
  )
}
