import type { BenchPatternId } from './bench'
import {
  BENCH_COLORS,
  benchFonts,
  benchGap,
  benchLayout,
  caption,
  panel
} from './bench-layout'
import { benchExtraScreen } from './bench-pattern-extra'
import { benchStressScreen, isBenchStressPattern } from './bench-pattern-stress'
import {
  arc,
  bar,
  conditionShape,
  indicator,
  lapText,
  spriteImage,
  valueText,
  type BenchImageAsset,
  type BenchPatternContext
} from './bench-widgets'
import type {
  BoardId,
  DashboardDocument,
  WidgetConfiguration,
  WidgetPlacement
} from './configuration-schema'

export interface BenchPatternOptions {
  board: BoardId
  pattern: BenchPatternId
  display: { width: number; height: number }
  family?: string
  image?: BenchImageAsset
}

export function buildBenchDashboard(options: BenchPatternOptions): DashboardDocument {
  const { display } = options
  const context: BenchPatternContext = {
    layout: benchLayout(display, 12, 10, benchGap(display.width)),
    fonts: benchFonts(display.height),
    family: options.family,
    image: options.image
  }
  const widgets = isBenchStressPattern(options.pattern)
    ? benchStressScreen(options.pattern, context)
    : options.pattern === 'all_widgets'
      ? allWidgets(context)
      : benchExtraScreen(options.pattern, context)
  return {
    board: options.board,
    dashboard: {
      transition: 'none',
      screens: [{ id: 'bench', background_color: BENCH_COLORS.screen, widgets }]
    }
  }
}

function allWidgets(context: BenchPatternContext): WidgetConfiguration[] {
  const { layout, fonts, family, image } = context
  const tile = layout.tile
  const widgets: WidgetConfiguration[] = [
    valueText(context, 'b_speed', tile(0, 0, 4, 1), 'vehicle.speed', { title: 'Speed' }),
    lapText(context, 'b_lap', tile(4, 0, 4, 1)),
    valueText(context, 'b_gear', tile(8, 0, 4, 1), 'transmission.gear', {
      title: 'Gear',
      alignment: 'center'
    }),
    arc(context, 'b_arc_rpm', tile(0, 1, 3, 3), {
      binding: 'engine.rpm_percent',
      minimum: 0,
      maximum: 100,
      fill: BENCH_COLORS.cyan,
      title: 'Rpm'
    }),
    arc(context, 'b_arc_thr', tile(3, 1, 3, 3), {
      binding: 'vehicle.throttle',
      minimum: 0,
      maximum: 100,
      fill: BENCH_COLORS.emerald,
      title: 'Throttle'
    }),
    {
      type: 'graph',
      id: 'b_gph_spd',
      placement: tile(6, 1, 6, 3),
      ...panel(),
      ...caption(family, fonts, 'Speed'),
      source: { binding: 'vehicle.speed' },
      minimum: 0,
      maximum: 320,
      point_count: 96,
      sample_interval_ms: 16,
      line_color: BENCH_COLORS.cyan,
      line_width_px: 2,
      traces: [
        {
          source: { binding: 'vehicle.throttle' },
          minimum: 0,
          maximum: 100,
          line_color: BENCH_COLORS.emerald
        }
      ]
    },
    indicator('b_ind_row', tile(0, 4, 12, 1), 'horizontal'),
    bar('b_bar_rpm', tile(0, 5, 8, 1), {
      binding: 'engine.rpm_percent',
      minimum: 0,
      maximum: 100,
      orientation: 'horizontal',
      fill: BENCH_COLORS.cyan,
      gradient: BENCH_COLORS.rose
    }),
    bar('b_bar_brk', tile(8, 5, 4, 1), {
      binding: 'vehicle.brake',
      minimum: 0,
      maximum: 100,
      orientation: 'horizontal',
      inverted: true,
      fill: BENCH_COLORS.rose
    }),
    container(context, tile(0, 6, 4, 4)),
    valueSlot(context, tile(4, 6, 4, 2)),
    pageSlot(context, tile(4, 8, 4, 2)),
    {
      type: 'graph',
      id: 'b_gph_tmp',
      placement: tile(8, 6, 4, 2),
      ...panel(),
      ...caption(family, fonts, 'Temp / delta'),
      source: { binding: 'engine.water_temperature' },
      minimum: 55,
      maximum: 115,
      point_count: 64,
      sample_interval_ms: 40,
      line_color: BENCH_COLORS.amber,
      line_width_px: 2,
      traces: [
        {
          source: { binding: 'session.lap.delta' },
          minimum: -2_000,
          maximum: 2_000,
          line_color: BENCH_COLORS.violet
        }
      ]
    },
    conditionShape('b_shp_warn', tile(10, 8, 2, 2))
  ]
  if (image) {
    widgets.splice(widgets.length - 1, 0, spriteImage(context, 'b_img_spr', tile(8, 8, 2, 2)))
  }
  return widgets
}

function container(context: BenchPatternContext, placement: WidgetPlacement): WidgetConfiguration {
  const inner = benchLayout(
    { width: placement.width ?? 2, height: placement.height ?? 2 },
    4,
    4,
    2
  )
  const child: BenchPatternContext = { ...context, layout: inner }
  return {
    type: 'shape',
    id: 'b_shp_box',
    placement,
    kind: 'rectangle',
    ...panel(),
    ...caption(context.family, context.fonts, 'Container'),
    clip_children: true,
    widgets: [
      valueText(child, 'b_pos', inner.tile(0, 0, 4, 1), 'session.position', {
        alignment: 'center',
        size: context.fonts.caption
      }),
      indicator('b_ind_col', inner.tile(0, 1, 1, 3), 'vertical'),
      bar('b_bar_thr', inner.tile(1, 1, 1, 3), {
        binding: 'vehicle.throttle',
        minimum: 0,
        maximum: 100,
        orientation: 'vertical',
        fill: BENCH_COLORS.emerald,
        framed: false
      }),
      arc(child, 'b_arc_str', inner.tile(2, 1, 2, 3), {
        binding: 'vehicle.steering',
        minimum: -1,
        maximum: 1,
        fill: BENCH_COLORS.violet
      })
    ]
  }
}

function valueSlot(context: BenchPatternContext, placement: WidgetPlacement): WidgetConfiguration {
  const inner = benchLayout({ width: placement.width ?? 2, height: placement.height ?? 2 }, 1, 1, 2)
  const child: BenchPatternContext = { ...context, layout: inner }
  return {
    type: 'slot',
    id: 'b_slt_val',
    placement,
    clip_children: true,
    pages: [
      {
        in_loop: true,
        widgets: [
          arc(child, 'b_arc_tur', inner.tile(0, 0, 1, 1), {
            binding: 'engine.turbo_pressure',
            minimum: 0,
            maximum: 210,
            fill: BENCH_COLORS.amber
          })
        ]
      },
      {
        in_loop: false,
        trigger: 'conditions',
        source: { binding: 'vehicle.brake' },
        conditions: [{ op: 'at_or_above', value: 60 }],
        duration_ms: 1_200,
        widgets: [
          valueText(child, 'b_brk', inner.tile(0, 0, 1, 1), 'vehicle.brake', {
            suffix: '%',
            alignment: 'center'
          })
        ]
      }
    ]
  }
}

function pageSlot(context: BenchPatternContext, placement: WidgetPlacement): WidgetConfiguration {
  const inner = benchLayout({ width: placement.width ?? 2, height: placement.height ?? 2 }, 1, 1, 2)
  const child: BenchPatternContext = { ...context, layout: inner }
  const first = context.image
    ? spriteImage(child, 'b_img_pg', inner.tile(0, 0, 1, 1))
    : conditionShape('b_shp_pg', inner.tile(0, 0, 1, 1))
  return {
    type: 'slot',
    id: 'b_slt_pag',
    placement,
    clip_children: true,
    pages: [
      { in_loop: true, widgets: [first] },
      {
        in_loop: true,
        widgets: [
          {
            type: 'shape',
            id: 'b_shp_alt',
            placement: inner.tile(0, 0, 1, 1),
            kind: 'ellipse',
            background_color: BENCH_COLORS.violet,
            background_grad_color: BENCH_COLORS.panel,
            background_grad_dir: 'vertical'
          }
        ]
      }
    ]
  }
}
