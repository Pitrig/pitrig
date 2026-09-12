import { type FontSpec, type TextAlignment, type WidgetConfiguration } from '@shared/configuration-schema'
import { type TelemetryValue, UNAVAILABLE, conditionValue } from '@shared/telemetry-value'
import { type AuthoredStyle, type ResolvedStyle, type StyledFrame, blinkVisible, matchedCondition, resolveWidgetStyle } from '@shared/widget-style'
import { previewFontFamily } from '@/features/font-library/font-face-store'
import { liveElapsedMs, readLiveValue, telemetryIsLive } from '@/features/telemetry/live-telemetry'
import { DEFAULT_BORDER_COLOR, DEFAULT_FILL_COLOR, DEFAULT_TEXT_COLOR } from './preview-theme'
import { type GlyphMetrics, measureGlyphs } from './text-metrics'

export const DEFAULT_CAPTION_FONT_SIZE_PX = 12

export type PreviewStyle = ResolvedStyle & { visible: boolean }

export interface PreviewValues {
  revision: number
  read: (binding: string | undefined) => TelemetryValue
  started: () => boolean
  elapsedMs: () => number
  numberFor: (source: { binding?: string } | undefined) => number | undefined
  styleFor: (frame: StyledFrame, authored: AuthoredStyle) => PreviewStyle
}

export function createPreviewValues(): PreviewValues {
  return valuesFrom(0, () => UNAVAILABLE, () => false, () => 0)
}

export function createLiveValues(revision: number): PreviewValues {
  return valuesFrom(revision, readLiveValue, telemetryIsLive, liveElapsedMs)
}

interface RuleState {
  held?: ResolvedStyle
  holdUntilMs: number
  blinkMs: number
  blinkStartedMs: number
}

const MAXIMUM_TRACKED_WIDGETS = 512

const ruleStates = new Map<string, RuleState>()

function heldStyle(
  frame: StyledFrame,
  authored: AuthoredStyle,
  value: number | undefined,
  nowMs: number
): { style: ResolvedStyle; blinkStartedMs: number } {
  const resolved = resolveWidgetStyle(frame, authored, value)
  const id = frame.id
  if (id === undefined) return { style: resolved, blinkStartedMs: 0 }
  const previous = ruleStates.get(id)
  const rule = matchedCondition(frame, value)
  const held =
    rule === undefined && previous?.held !== undefined && nowMs < previous.holdUntilMs
      ? previous.held
      : undefined
  const style = held ?? resolved
  const blinkStartedMs =
    previous !== undefined && previous.blinkMs === style.blinkMs ? previous.blinkStartedMs : nowMs
  if (previous === undefined && ruleStates.size >= MAXIMUM_TRACKED_WIDGETS) ruleStates.clear()
  ruleStates.set(id, {
    held: rule === undefined ? held : resolved,
    holdUntilMs: rule === undefined ? (previous?.holdUntilMs ?? 0) : nowMs + (rule.hold_ms ?? 0),
    blinkMs: style.blinkMs,
    blinkStartedMs
  })
  return { style, blinkStartedMs }
}

function valuesFrom(
  revision: number,
  read: (binding: string | undefined) => TelemetryValue,
  started: () => boolean,
  elapsedMs: () => number
): PreviewValues {
  return {
    revision,
    read,
    started,
    elapsedMs,
    numberFor: (source) => conditionValue(read(source?.binding)),
    styleFor: (frame, authored) => {
      const watched = conditionValue(read(frame.condition_source?.binding))
      const nowMs = elapsedMs()
      const { style, blinkStartedMs } = heldStyle(frame, authored, watched, nowMs)
      return { ...style, visible: blinkVisible(style, nowMs - blinkStartedMs) }
    }
  }
}

export function authoredStyleOf(configuration: WidgetConfiguration): AuthoredStyle {
  const backgroundColor = configuration.background_color
  const borderColor = configuration.border?.color ?? DEFAULT_BORDER_COLOR
  switch (configuration.type) {
    case 'text':
      return {
        color: configuration.value?.color ?? DEFAULT_TEXT_COLOR,
        backgroundColor,
        borderColor
      }
    case 'bar':
    case 'arc':
      return { color: configuration.fill_color ?? DEFAULT_FILL_COLOR, backgroundColor, borderColor }
    case 'graph':
      return { color: configuration.line_color ?? DEFAULT_FILL_COLOR, backgroundColor, borderColor }
    case 'image':
      return { color: configuration.recolor, backgroundColor, borderColor }
    default:
      return { backgroundColor, borderColor }
  }
}

interface PreviewFont {
  family: string
  sizePx: number
  weight: number
  resolved: boolean
}

export function resolvedFont(
  font: FontSpec | undefined,
  defaultSizePx: number,
  loadedFamilies: Readonly<Record<string, boolean>>
): PreviewFont {
  const identifier = font?.family ?? 'custom_font'
  const sizePx = font?.size_px ?? defaultSizePx
  const spare = font?.fallback && loadedFamilies[font.fallback]
    ? `,${previewFontFamily(font.fallback)}`
    : ''
  if (loadedFamilies[identifier]) {
    return { family: `${previewFontFamily(identifier)}${spare}`, sizePx, weight: 400, resolved: true }
  }
  const black = identifier.includes('black')
  return {
    family: identifier.startsWith('roboto')
      ? 'Roboto, Arial, sans-serif'
      : 'Arial, sans-serif',
    sizePx,
    weight: black ? 900 : 600,
    resolved: false
  }
}

export function fontMetrics(text: string, font: PreviewFont): GlyphMetrics {
  return measureGlyphs(text, font.family, font.sizePx, font.weight)
}

export function lvglCenterOffset(available: number, size: number): number {
  return Math.trunc(available / 2) - Math.trunc(size / 2)
}

export function centerOffset(available: number, size: number): number {
  return Math.trunc((available - size) / 2)
}

export function normalizeColor(color: string | undefined): string | undefined {
  return color === '#00000000' ? 'transparent' : color
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

export function alignmentAnchor(alignment: TextAlignment): {
  column: 'left' | 'center' | 'right'
  row: 'top' | 'middle' | 'bottom'
} {
  switch (alignment) {
    case 'top_left':
      return { column: 'left', row: 'top' }
    case 'top_center':
      return { column: 'center', row: 'top' }
    case 'top_right':
      return { column: 'right', row: 'top' }
    case 'left':
      return { column: 'left', row: 'middle' }
    case 'right':
      return { column: 'right', row: 'middle' }
    case 'bottom_left':
      return { column: 'left', row: 'bottom' }
    case 'bottom_center':
      return { column: 'center', row: 'bottom' }
    case 'bottom_right':
      return { column: 'right', row: 'bottom' }
    default:
      return { column: 'center', row: 'middle' }
  }
}

export interface CaptionGeometry {
  x: number
  y: number
  gap?: Box
}

export function captionGeometry(
  box: Box,
  title: {
    alignment: TextAlignment
    offsetX: number
    offsetY: number
    borderGap: boolean
    pad: number
  },
  metrics: { width: number; lineHeight: number },
  borderWidth: number
): CaptionGeometry {
  const { column, row } = alignmentAnchor(title.alignment)
  const columnOffset =
    column === 'left'
      ? 0
      : column === 'right'
        ? box.width - metrics.width
        : Math.trunc((box.width - metrics.width) / 2)
  const rowY =
    row === 'top'
      ? box.y - Math.trunc(metrics.lineHeight / 2)
      : row === 'bottom'
        ? box.y + box.height - Math.trunc(metrics.lineHeight / 2)
        : box.y + Math.trunc((box.height - metrics.lineHeight) / 2)
  const x = box.x + columnOffset + title.offsetX
  const y = rowY + title.offsetY
  if (!title.borderGap || borderWidth <= 0) return { x, y }

  const left = x - title.pad
  const right = x + metrics.width + title.pad
  const top = y - title.pad
  const bottom = y + metrics.lineHeight + title.pad
  const boxRight = box.x + box.width
  const boxBottom = box.y + box.height
  const spanLeft = Math.max(left, box.x)
  const spanRight = Math.min(right, boxRight)
  const spanTop = Math.max(top, box.y)
  const spanBottom = Math.min(bottom, boxBottom)
  const thickness = borderWidth + 2
  const spansX = spanRight > spanLeft
  const spansY = spanBottom > spanTop
  if (spansX && top < box.y + borderWidth && bottom > box.y) {
    return { x, y, gap: { x: spanLeft, y: box.y, width: spanRight - spanLeft, height: thickness } }
  }
  if (spansX && bottom > boxBottom - borderWidth && top < boxBottom) {
    return { x, y, gap: { x: spanLeft, y: boxBottom - thickness, width: spanRight - spanLeft, height: thickness } }
  }
  if (spansY && left < box.x + borderWidth && right > box.x) {
    return { x, y, gap: { x: box.x, y: spanTop, width: thickness, height: spanBottom - spanTop } }
  }
  if (spansY && right > boxRight - borderWidth && left < boxRight) {
    return { x, y, gap: { x: boxRight - thickness, y: spanTop, width: thickness, height: spanBottom - spanTop } }
  }
  return { x, y }
}
