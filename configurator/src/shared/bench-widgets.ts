import {
  BENCH_COLORS,
  arcThickness,
  caption,
  font,
  panel,
  type BenchFonts,
  type BenchLayout
} from './bench-layout'
import type { RgbColor, WidgetConfiguration, WidgetPlacement } from './configuration-schema'

export interface BenchImageAsset {
  name: string
  frameCount: number
}

export interface BenchPatternContext {
  layout: BenchLayout
  fonts: BenchFonts
  family?: string
  image?: BenchImageAsset
}

export const INDICATOR_PALETTE: readonly RgbColor[] = [
  BENCH_COLORS.emerald,
  BENCH_COLORS.emerald,
  BENCH_COLORS.cyan,
  BENCH_COLORS.cyan,
  BENCH_COLORS.amber,
  BENCH_COLORS.amber,
  BENCH_COLORS.rose,
  BENCH_COLORS.rose
]

export function valueText(
  context: BenchPatternContext,
  id: string,
  placement: WidgetPlacement,
  binding: string,
  options: { title?: string; suffix?: string; alignment?: 'center' | 'right'; size?: number } = {}
): WidgetConfiguration {
  const { family, fonts } = context
  if (family === undefined) return placeholder(id, placement)
  return {
    type: 'text',
    id,
    placement,
    ...panel(),
    ...(options.title ? caption(family, fonts, options.title) : {}),
    sources: [
      {
        binding,
        ...(options.suffix ? { transform: { type: 'none' as const, suffix: options.suffix } } : {})
      }
    ],
    value: {
      font: font(family, options.size ?? fonts.value),
      color: BENCH_COLORS.text,
      alignment: options.alignment ?? 'right',
      unavailable_text: '--'
    }
  }
}

export function lapText(
  context: BenchPatternContext,
  id: string,
  placement: WidgetPlacement
): WidgetConfiguration {
  const { family, fonts } = context
  if (family === undefined) return placeholder(id, placement)
  return {
    type: 'text',
    id,
    placement,
    ...panel(),
    ...caption(family, fonts, 'Lap'),
    sources: [
      { binding: 'session.lap.current_time', transform: { type: 'time', format: 'duration_ms' } }
    ],
    value: {
      font: font(family, fonts.value),
      color: BENCH_COLORS.text,
      alignment: 'right',
      unavailable_text: '--:--'
    }
  }
}

export function arc(
  context: BenchPatternContext,
  id: string,
  placement: WidgetPlacement,
  options: {
    binding: string
    minimum: number
    maximum: number
    fill: RgbColor
    title?: string
  }
): WidgetConfiguration {
  return {
    type: 'arc',
    id,
    placement,
    ...(options.title ? caption(context.family, context.fonts, options.title) : {}),
    source: { binding: options.binding },
    minimum: options.minimum,
    maximum: options.maximum,
    start_angle_deg: 135,
    sweep_deg: 270,
    thickness_px: arcThickness(placement),
    track_color: BENCH_COLORS.track,
    fill_color: options.fill
  }
}

export function indicator(
  id: string,
  placement: WidgetPlacement,
  orientation: 'horizontal' | 'vertical'
): WidgetConfiguration {
  return {
    type: 'indicator',
    id,
    placement,
    source: { binding: 'engine.rpm_percent' },
    minimum: 0,
    maximum: 100,
    orientation,
    segment_gap_px: 2,
    segment_radius_px: 2,
    off_color: BENCH_COLORS.track,
    blink_threshold: 94,
    blink_ms: 150,
    segments: INDICATOR_PALETTE.map((color, index) => ({
      threshold: Math.round(((index + 1) / INDICATOR_PALETTE.length) * 100),
      color
    }))
  }
}

export function bar(
  id: string,
  placement: WidgetPlacement,
  options: {
    binding: string
    minimum: number
    maximum: number
    orientation: 'horizontal' | 'vertical'
    fill: RgbColor
    gradient?: RgbColor
    inverted?: boolean
    framed?: boolean
  }
): WidgetConfiguration {
  return {
    type: 'bar',
    id,
    placement,
    ...(options.framed === false
      ? { background_color: BENCH_COLORS.track }
      : panel()),
    source: { binding: options.binding },
    minimum: options.minimum,
    maximum: options.maximum,
    orientation: options.orientation,
    ...(options.inverted ? { inverted: true } : {}),
    fill_color: options.fill,
    ...(options.gradient ? { fill_grad_color: options.gradient } : {})
  }
}

export function spriteImage(
  context: BenchPatternContext,
  id: string,
  placement: WidgetPlacement
): WidgetConfiguration {
  const frames = context.image?.frameCount ?? 1
  return {
    type: 'image',
    id,
    placement,
    image: context.image?.name ?? '',
    ...(frames > 1 ? { sprite_frame_source: { binding: 'session.position' } } : { sprite_frame: 0 })
  }
}

export function conditionShape(id: string, placement: WidgetPlacement): WidgetConfiguration {
  return {
    type: 'shape',
    id,
    placement,
    kind: 'ellipse',
    background_color: BENCH_COLORS.track,
    border: { color: BENCH_COLORS.panelEdge, width_px: 2, radius_px: 0 },
    condition_source: { binding: 'engine.rpm_percent' },
    conditions: [
      { op: 'at_or_above', value: 92, background_color: BENCH_COLORS.rose, blink_ms: 200 },
      { op: 'at_or_above', value: 70, background_color: BENCH_COLORS.amber },
      { op: 'below', value: 25, background_color: BENCH_COLORS.emerald }
    ]
  }
}

function placeholder(id: string, placement: WidgetPlacement): WidgetConfiguration {
  return {
    type: 'shape',
    id,
    placement,
    kind: 'rectangle',
    background_color: BENCH_COLORS.track,
    border: { color: BENCH_COLORS.panelEdge, width_px: 1, radius_px: 4 }
  }
}
