import { type FontSpec, type TextAlignment } from '@shared/configuration-schema'
import { type TelemetryValue, UNAVAILABLE, conditionValue } from '@shared/telemetry-value'
import { type AuthoredStyle, type ResolvedStyle, type StyledFrame, blinkVisible, resolveWidgetStyle } from '@shared/widget-style'
import { previewFontFamily } from '@/features/font-library/font-face-store'
import { liveElapsedMs, readLiveValue } from '@/features/telemetry/live-telemetry'
import { type GlyphMetrics, measureGlyphs } from './text-metrics'

export interface PreviewValues {
  read: (binding: string | undefined) => TelemetryValue
  numberFor: (source: { binding?: string } | undefined) => number | undefined
  styleFor: (frame: StyledFrame, authored: AuthoredStyle) => ResolvedStyle & { visible: boolean }
}

export function createPreviewValues(): PreviewValues {
  return valuesFrom(() => UNAVAILABLE)
}

export function createLiveValues(): PreviewValues {
  return valuesFrom(readLiveValue)
}

function valuesFrom(read: (binding: string | undefined) => TelemetryValue): PreviewValues {
  return {
    read,
    numberFor: (source) => conditionValue(read(source?.binding)),
    styleFor: (frame, authored) => {
      const watched = conditionValue(read(frame.condition_source?.binding))
      const style = resolveWidgetStyle(frame, authored, watched)
      return { ...style, visible: blinkVisible(style, liveElapsedMs()) }
    }
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
