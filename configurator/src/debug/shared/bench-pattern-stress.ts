import type { BenchPatternId } from './bench'
import { BENCH_COLORS, benchGap, benchLayout, caption, font, panel } from './bench-layout'
import {
  arc,
  bar,
  indicator,
  spriteImage,
  valueText,
  type BenchPatternContext
} from './bench-widgets'
import type { RgbColor, WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'

const NUMERIC: readonly { binding: string; minimum: number; maximum: number }[] = [
  { binding: 'engine.turbo_pressure', minimum: 0, maximum: 210 },
  { binding: 'vehicle.throttle', minimum: 0, maximum: 100 },
  { binding: 'engine.rpm_percent', minimum: 0, maximum: 100 },
  { binding: 'vehicle.brake', minimum: 0, maximum: 100 },
  { binding: 'vehicle.steering', minimum: -1, maximum: 1 },
  { binding: 'engine.water_temperature', minimum: 55, maximum: 115 }
]

const LINE_COLORS: readonly RgbColor[] = [
  BENCH_COLORS.cyan,
  BENCH_COLORS.emerald,
  BENCH_COLORS.amber,
  BENCH_COLORS.rose,
  BENCH_COLORS.violet,
  BENCH_COLORS.blue
]

function numericAt(index: number): { binding: string; minimum: number; maximum: number } {
  return (
    NUMERIC[index % NUMERIC.length] ?? { binding: 'engine.rpm_percent', minimum: 0, maximum: 100 }
  )
}

function colorAt(index: number): RgbColor {
  return LINE_COLORS[index % LINE_COLORS.length] ?? BENCH_COLORS.cyan
}

const BENCH_STRESS_IDS = [
  'text_16',
  'text_32',
  'text_64',
  'text_32_plain',
  'text_32_shapes',
  'shapes_96',
  'huge_text_4',
  'bars_24',
  'arcs_12',
  'graphs_6',
  'sprites_24',
  'indicators_12',
  'nested_containers'
] as const

export function isBenchStressPattern(pattern: BenchPatternId): boolean {
  return (BENCH_STRESS_IDS as readonly string[]).includes(pattern)
}

export function benchStressScreen(
  pattern: BenchPatternId,
  context: BenchPatternContext
): WidgetConfiguration[] {
  switch (pattern) {
    case 'text_16':
      return textGrid(context, 16, 4)
    case 'text_32':
      return textGrid(context, 32, 8)
    case 'text_64':
      return textGrid(context, 64, 8)
    case 'text_32_plain':
      return textGrid(context, 32, 8, true)
    case 'text_32_shapes':
      return context.family === undefined
        ? decoration(context, 96)
        : [...decoration(context, 96), ...textGrid(context, 32, 8)]
    case 'shapes_96':
      return [
        ...decoration(context, context.family === undefined ? 95 : 96),
        ...textGrid(context, 1, 1)
      ]
    case 'huge_text_4':
      return hugeText(context)
    case 'bars_24':
      return bars(context)
    case 'arcs_12':
      return arcs(context)
    case 'graphs_6':
      return graphs(context)
    case 'sprites_24':
      return sprites(context)
    case 'indicators_12':
      return indicators(context)
    default:
      return nestedContainers(context)
  }
}

function cells(
  context: BenchPatternContext,
  count: number,
  columns: number
): { placement: WidgetPlacement; index: number }[] {
  const { box } = context.layout
  const rows = Math.max(1, Math.ceil(count / columns))
  const gap = benchGap(box.width)
  const grid = benchLayout(box, columns, rows, gap)
  return Array.from({ length: count }, (_unused, index) => ({
    index,
    placement: grid.tile(index % columns, Math.floor(index / columns), 1, 1)
  }))
}

function textGrid(
  context: BenchPatternContext,
  count: number,
  columns: number,
  plain = false
): WidgetConfiguration[] {
  const { family } = context
  const rows = Math.max(1, Math.ceil(count / columns))
  const size = Math.max(11, Math.round(context.layout.box.height / (rows * 2.4)))
  return cells(context, count, columns).map(({ index, placement }) => {
    const binding = numericAt(index).binding
    if (!plain || family === undefined) {
      return valueText(context, `b_t${index}`, placement, binding, { alignment: 'center', size })
    }
    return {
      type: 'text',
      id: `b_t${index}`,
      placement,
      background_color: BENCH_COLORS.panel,
      sources: [{ binding }],
      value: {
        font: font(family, size),
        color: BENCH_COLORS.text,
        alignment: 'center',
        unavailable_text: '--'
      }
    }
  })
}

function decoration(context: BenchPatternContext, count: number): WidgetConfiguration[] {
  return cells(context, count, 12).map(({ index, placement }) => ({
    type: 'shape' as const,
    id: `b_s${index}`,
    placement,
    z_index: -10,
    kind: 'rectangle' as const,
    background_color: index % 2 === 0 ? BENCH_COLORS.panel : BENCH_COLORS.track,
    border: { color: BENCH_COLORS.panelEdge, width_px: 1, radius_px: 0 }
  }))
}

function hugeText(context: BenchPatternContext): WidgetConfiguration[] {
  const size = Math.max(24, Math.round(context.layout.box.height / 4))
  return cells(context, 4, 2).map(({ index, placement }) =>
    valueText(context, `b_h${index}`, placement, numericAt(index).binding, {
      alignment: 'center',
      size
    })
  )
}

function bars(context: BenchPatternContext): WidgetConfiguration[] {
  return cells(context, 24, 4).map(({ index, placement }) => {
    const signal = numericAt(index)
    return bar(`b_b${index}`, placement, {
      binding: signal.binding,
      minimum: signal.minimum,
      maximum: signal.maximum,
      orientation: index % 2 === 0 ? 'horizontal' : 'vertical',
      fill: colorAt(index),
      ...(index % 3 === 0 ? { gradient: BENCH_COLORS.rose } : {})
    })
  })
}

function arcs(context: BenchPatternContext): WidgetConfiguration[] {
  return cells(context, 12, 4).map(({ index, placement }) => {
    const signal = numericAt(index)
    return arc(context, `b_a${index}`, placement, {
      binding: signal.binding,
      minimum: signal.minimum,
      maximum: signal.maximum,
      fill: colorAt(index)
    })
  })
}

function graphs(context: BenchPatternContext): WidgetConfiguration[] {
  const { family, fonts } = context
  return cells(context, 6, 2).map(({ index, placement }) => {
    const signal = numericAt(index)
    const other = numericAt(index + 1)
    return {
      type: 'graph' as const,
      id: `b_g${index}`,
      placement,
      ...panel(),
      ...caption(family, fonts, `Graph ${index + 1}`),
      source: { binding: signal.binding },
      minimum: signal.minimum,
      maximum: signal.maximum,
      point_count: 96,
      sample_interval_ms: 16,
      line_color: colorAt(index),
      line_width_px: 2,
      traces: [
        {
          source: { binding: other.binding },
          minimum: other.minimum,
          maximum: other.maximum,
          line_color: colorAt(index + 3)
        }
      ]
    }
  })
}

function sprites(context: BenchPatternContext): WidgetConfiguration[] {
  if (context.image === undefined) return textGrid(context, 24, 6)
  return cells(context, 24, 6).map(({ index, placement }) =>
    spriteImage(context, `b_i${index}`, placement, { binding: 'vehicle.clutch' })
  )
}

function indicators(context: BenchPatternContext): WidgetConfiguration[] {
  return cells(context, 12, 3).map(({ index, placement }) =>
    indicator(`b_n${index}`, placement, index % 2 === 0 ? 'horizontal' : 'vertical', {
      binding: 'engine.turbo_pressure',
      minimum: 0,
      maximum: 210
    })
  )
}

function nestedContainers(context: BenchPatternContext): WidgetConfiguration[] {
  const { family, fonts } = context
  const size = Math.max(11, Math.round(context.layout.box.height / 14))
  return cells(context, 8, 4).map(({ index, placement }) => {
    const inner = benchLayout(
      { width: placement.width ?? 2, height: placement.height ?? 2 },
      2,
      2,
      2
    )
    const child: BenchPatternContext = { ...context, layout: inner }
    return {
      type: 'shape' as const,
      id: `b_c${index}`,
      placement,
      kind: 'rectangle' as const,
      ...panel(),
      ...caption(family, fonts, `Box ${index + 1}`),
      clip_children: true,
      widgets: Array.from({ length: 4 }, (_unused, slot) =>
        valueText(
          child,
          `b_c${index}_${slot}`,
          inner.tile(slot % 2, Math.floor(slot / 2), 1, 1),
          numericAt(index + slot).binding,
          { alignment: 'center', size }
        )
      )
    }
  })
}
