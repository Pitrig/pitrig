import { dashboardBindings } from '../../../../../shared/configuration-access'
import { type FontSpec } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { LAP_SECONDS, mockTelemetry, mockValue } from '../../../../../shared/mock-telemetry'
import { TELEMETRY_CATALOG } from '../../../../../shared/telemetry-catalog'
import { type TelemetryValue, UNAVAILABLE, conditionValue } from '../../../../../shared/telemetry-value'
import { type AuthoredStyle, type ResolvedStyle, type StyledFrame, blinkVisible, resolveWidgetStyle } from '../../../../../shared/widget-style'
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
