import {
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_GRAPH_SOURCES,
  MAXIMUM_GRAPH_TRACES,
  MAXIMUM_INDICATOR_SEGMENTS,
  MAXIMUM_TEXT_SOURCES,
  MAXIMUM_WIDGET_CONDITIONS,
  type WidgetConfiguration
} from '../configuration-schema'
import { arrayOf, isTextWidget } from '../configuration-access'
import { deviceFloat } from '../contract-number'
import { IMAGE_ID_PATTERN } from '../image-assets'
import { transformError } from './transforms'
import { DEFAULT_TEXT_BINDING, badBinding, badColors, badReal, realFits } from './values'
import { findEnumError } from './widget-enums'
import { t } from '../ui-text'

const CHILD_KEYS: readonly string[] = ['widgets', 'pages']

function rangeError(
  widget: { minimum?: number; maximum?: number },
  label: string,
  what: string
): string | undefined {
  const minimum = widget.minimum ?? 0
  const maximum = widget.maximum ?? 1
  if (
    realFits(widget.minimum) &&
    realFits(widget.maximum) &&
    deviceFloat(maximum) > deviceFloat(minimum)
  ) {
    return undefined
  }
  return t('validation.widgetValues.whatOfLabelRunsMinimum', { what: what, label: label, minimum: minimum, maximum: maximum })
}

function findSourceError(widget: WidgetConfiguration, label: string): string | undefined {
  if (isTextWidget(widget)) {
    const sources = arrayOf(widget.sources)
    if (sources.length === 0) return t('validation.widgetValues.labelHasNoSourceSo', { label: label })
    if (sources.length > MAXIMUM_TEXT_SOURCES) {
      return t('validation.widgetValues.labelComposesLengthSourcesThe', { label: label, length: sources.length, mAXIMUM_TEXT_SOURCES: MAXIMUM_TEXT_SOURCES })
    }
    for (const [index, source] of sources.entries()) {
      const what = t('inspector.sourceEditor.sourceNumber', { number: index + 1 })
      const error = badBinding(source?.binding, DEFAULT_TEXT_BINDING, label, what)
      if (error) return error
      const mismatch = transformError(
        source?.transform,
        source?.binding ?? DEFAULT_TEXT_BINDING,
        label,
        t('validation.widgetValues.theTransformOnSourceNumber', { number: index + 1 })
      )
      if (mismatch) return mismatch
    }
    return undefined
  }
  if (widget.type === 'bar' || widget.type === 'arc' || widget.type === 'indicator' || widget.type === 'graph') {
    const error = badBinding(widget.source?.binding, '', label, t('validation.widgetValues.theSource'))
    if (error) return error
    const window = rangeError(widget, label, t('validation.widgetValues.theValueWindow'))
    if (window) return window
  }
  if (widget.type === 'graph') {
    const traces = arrayOf(widget.traces)
    if (traces.length > MAXIMUM_GRAPH_TRACES) {
      return t('validation.widgetValues.labelDrawsLengthSourcesThe', { label, length: traces.length + 1, maximum: MAXIMUM_GRAPH_SOURCES })
    }
    for (const [index, trace] of traces.entries()) {
      const error = badBinding(trace?.source?.binding, '', label, t('common.traceNumber', { number: index + 1 }))
      if (error) return error
      const window = rangeError(trace ?? {}, label, t('validation.widgetValues.theWindowOfTraceNumber', { number: index + 1 }))
      if (window) return window
    }
  }
  if (widget.type === 'image') {
    const image = widget.image ?? ''
    if (!IMAGE_ID_PATTERN.test(image)) {
      return t('validation.widgetValues.labelNamesTheImageImage', { label: label, image: image })
    }
    if (widget.sprite_frame_source) {
      const error = badBinding(widget.sprite_frame_source.binding, '', label, t('validation.widgetValues.theSpriteFrameSource'))
      if (error) return error
    }
  }
  return undefined
}

function findCaptionError(widget: WidgetConfiguration, label: string): string | undefined {
  const binding = widget.title?.source?.binding
  if (!binding) return undefined
  if (!widget.title?.text) {
    return t('validation.widgetValues.theCaptionOfLabelReads', { label: label })
  }
  return badBinding(binding, '', label, t('validation.widgetValues.theCaptionSource'))
}

function findConditionError(widget: WidgetConfiguration, label: string): string | undefined {
  const rules = arrayOf(widget.conditions)
  const stops = arrayOf(widget.color_ramp?.stops)
  if (rules.length > MAXIMUM_WIDGET_CONDITIONS) {
    return t('validation.widgetValues.labelHasLengthStylingRules', { label: label, length: rules.length, mAXIMUM_WIDGET_CONDITIONS: MAXIMUM_WIDGET_CONDITIONS })
  }
  if (stops.length === 1) {
    return t('validation.widgetValues.labelHasAColourRamp', { label: label })
  }
  if (stops.length > MAXIMUM_COLOR_STOPS) {
    return t('validation.widgetValues.labelHasAColourRamp2', { label: label, length: stops.length, mAXIMUM_COLOR_STOPS: MAXIMUM_COLOR_STOPS })
  }
  let previous = Number.NEGATIVE_INFINITY
  for (const [index, stop] of stops.entries()) {
    if (!realFits(stop?.at) || deviceFloat(stop?.at ?? 0) <= previous) {
      return t('validation.widgetValues.labelHasAColourRampWhose', { label, number: index + 1 })
    }
    previous = deviceFloat(stop?.at ?? 0)
  }
  for (const [index, rule] of rules.entries()) {
    if (!realFits(rule?.value)) {
      return t('validation.widgetValues.ruleOfLabelComparesAgainst', { number: index + 1, label })
    }
  }
  if (rules.length === 0 && stops.length === 0) return undefined
  return badBinding(widget.condition_source?.binding, '', label, t('validation.widgetValues.theWatchedSource'))
}

function findSegmentError(widget: WidgetConfiguration, label: string): string | undefined {
  if (widget.type !== 'indicator') return undefined
  const segments = arrayOf(widget.segments)
  if (segments.length === 0) return t('validation.widgetValues.labelHasNoSegmentsSo', { label: label })
  if (segments.length > MAXIMUM_INDICATOR_SEGMENTS) {
    return t('validation.widgetValues.labelHasLengthSegmentsThe', { label: label, length: segments.length, mAXIMUM_INDICATOR_SEGMENTS: MAXIMUM_INDICATOR_SEGMENTS })
  }
  let previous = Number.NEGATIVE_INFINITY
  for (const [index, segment] of segments.entries()) {
    const threshold = deviceFloat(segment?.threshold ?? 0)
    if (!realFits(segment?.threshold) || threshold < previous) {
      return t('validation.widgetValues.labelHasSegmentNumberBelow', { label, number: index + 1 })
    }
    if (threshold < 0 || threshold > 1) {
      return t('validation.widgetValues.labelHasSegmentNumberOutside', { label, number: index + 1 })
    }
    previous = threshold
  }
  return undefined
}

function findRealError(widget: WidgetConfiguration, label: string): string | undefined {
  if (widget.type === 'bar') return badReal(widget.origin, label, 'origin')
  if (widget.type === 'indicator') return badReal(widget.blink_threshold, label, 'blink_threshold')
  return undefined
}

function findFillGradientError(widget: WidgetConfiguration, label: string): string | undefined {
  if (widget.type !== 'bar' && widget.type !== 'arc') return undefined
  if (widget.fill_grad_mid_color !== undefined && widget.fill_grad_color === undefined) {
    return t('validation.widgetValues.labelSetsAMiddleGradient', { label: label })
  }
  return undefined
}

export function findWidgetValueError(
  widget: WidgetConfiguration,
  label: string
): string | undefined {
  return (
    badColors(widget, label, CHILD_KEYS) ??
    findFillGradientError(widget, label) ??
    findEnumError(widget, label) ??
    findRealError(widget, label) ??
    findSourceError(widget, label) ??
    findCaptionError(widget, label) ??
    findConditionError(widget, label) ??
    findSegmentError(widget, label)
  )
}
