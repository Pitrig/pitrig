import { dashboardBindings } from '@shared/configuration-access'
import { type FontSpec, type TextAlignment } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { LAP_SECONDS, mockTelemetry, mockValue } from '@shared/mock-telemetry'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { type TelemetryValue, UNAVAILABLE, conditionValue } from '@shared/telemetry-value'
import { type AuthoredStyle, type ResolvedStyle, type StyledFrame, blinkVisible, resolveWidgetStyle } from '@shared/widget-style'
import { type PreviewPlayback } from '../dashboard-editor'
import { previewFontFamily } from '../preview-assets'
import { type GlyphMetrics, measureGlyphs } from '../text-metrics'

/**
 * What the previews ask about a value. Wrapping the map keeps every renderer
 * from repeating the "read the binding, take its numeric view, resolve the
 * frame" chain, and keeps the placeholders mode from needing a second code
 * path — it simply answers "unavailable" to everything.
 */
export interface PreviewValues {
  read: (binding: string | undefined) => TelemetryValue
  /** Numeric view of what a widget's own source reads, for a fill or a sweep. */
  numberFor: (source: { binding?: string } | undefined) => number | undefined
  /** Authored style with the ramp and the rules applied, plus blink visibility. */
  styleFor: (frame: StyledFrame, authored: AuthoredStyle) => ResolvedStyle & { visible: boolean }
  /** Whether a lamp is lit on this frame, for a widget that blinks by itself. */
  blinkPhase: (blinkMs: number) => boolean
  /**
   * The samples a graph would be holding right now. The mock is a pure function
   * of the lap phase, so the trace is the real thing rather than a sketch: it is
   * the same signal evaluated at the phases that came before this one.
   */
  traceFor: (
    source: { binding?: string } | undefined,
    points: number,
    sampleIntervalMs: number
  ) => number[] | undefined
  /** Whether any value is being played at all. */
  live: boolean
}

export function createPreviewValues(
  configuration: DeviceConfiguration,
  playback: PreviewPlayback,
  clockMs: number
): PreviewValues {
  const values =
    playback.mode === 'values'
      ? mockTelemetry(dashboardBindings(configuration), playback.phase)
      : new Map<string, TelemetryValue>()
  const read = (binding: string | undefined): TelemetryValue =>
    (binding ? values.get(binding) : undefined) ?? UNAVAILABLE
  return {
    read,
    numberFor: (source) => conditionValue(read(source?.binding)),
    styleFor: (frame, authored) => {
      const style = resolveWidgetStyle(frame, authored, conditionValue(read(frame.condition_source?.binding)))
      return { ...style, visible: blinkVisible(style, clockMs) }
    },
    blinkPhase: (blinkMs) => blinkMs <= 0 || clockMs % blinkMs < blinkMs / 2,
    traceFor: (source, points, sampleIntervalMs) => {
      if (playback.mode !== 'values' || !source?.binding || points < 2) return undefined
      const entry = TELEMETRY_CATALOG.find(({ name }) => name === source.binding)
      if (!entry) return undefined
      const step = sampleIntervalMs / (LAP_SECONDS * 1000)
      return Array.from({ length: points }, (_, index) =>
        conditionValue(mockValue(entry, playback.phase - (points - 1 - index) * step)) ?? 0
      )
    },
    live: playback.mode === 'values'
  }
}

/**
 * The box a widget draws its content in. LVGL positions every child against the
 * container's content area, which the border and the padding have already
 * inset, so the canvas has to inset the same way — otherwise a bordered arc is
 * drawn at its full placement here and one border narrower on the board.
 */

interface PreviewFont {
  family: string
  sizePx: number
  weight: number
  /** Whether this is the face the board rasterizes rather than a stand-in. */
  uploaded: boolean
}

/**
 * The face to draw one font spec with. The uploaded face is used when the
 * configurator still holds the copy it installed; otherwise this falls back to
 * a system face picked to look roughly like it, and the layout it produces is
 * an approximation of the board's.
 */
export function resolvedFont(
  font: FontSpec | undefined,
  defaultSizePx: number,
  uploadedFamilies: Readonly<Record<string, boolean>>
): PreviewFont {
  const identifier = font?.family ?? 'custom_font'
  const sizePx = font?.size_px ?? defaultSizePx
  if (uploadedFamilies[identifier]) {
    // The face carries its own weight; asking for a heavier one would have the
    // browser synthesize a thicker version of glyphs the board draws as they
    // are.
    return { family: previewFontFamily(identifier), sizePx, weight: 400, uploaded: true }
  }
  const black = identifier.includes('black')
  return {
    family: identifier.startsWith('roboto')
      ? 'Roboto, Arial, sans-serif'
      : 'Arial, sans-serif',
    sizePx,
    weight: black ? 900 : 600,
    uploaded: false
  }
}

export function fontMetrics(text: string, font: PreviewFont): GlyphMetrics {
  return measureGlyphs(text, font.family, font.sizePx, font.weight)
}

/**
 * LVGL centres in whole pixels and truncates each half separately, so a box and
 * its contents can land one pixel off what an exact midpoint would give.
 */
export function lvglCenterOffset(available: number, size: number): number {
  return Math.trunc(available / 2) - Math.trunc(size / 2)
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

/**
 * The two axes of a nine-point anchor. Mirrors `anchor_of` in widget_frame.cpp:
 * spelled out rather than derived from the enum's order, which the contract is
 * free to change.
 */
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

/** Where the caption lands, and the frame line it cuts on its way there. */
export interface CaptionGeometry {
  x: number
  y: number
  /** Absent when the caption crosses no border, or the cut is turned off. */
  gap?: Box
}

/**
 * Mirrors widget_frame.cpp `caption_rect` and `caption_gap_rect` exactly: the
 * anchor is the widget's outer box rather than its content area, C++ truncation
 * toward zero is Math.trunc, and the mask is one thin band along the border the
 * caption actually crosses, clipped to the box so it never paints outside it.
 */
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
  // The top and bottom rows straddle their border line, which is what lets the
  // caption break it. The middle row sits inside the box and breaks nothing.
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
  // A horizontal border wins a corner, because a caption is a horizontal run of
  // text and that is the line it reads as breaking.
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
