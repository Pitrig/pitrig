import type { BenchPatternId } from './bench'
import { BENCH_COLORS } from './bench-layout'
import { bar, valueText, type BenchPatternContext } from './bench-widgets'
import type { WidgetConfiguration } from './configuration-schema'

const TEXT_FIELDS: readonly { id: string; binding: string; title: string; suffix?: string }[] = [
  { id: 'b_t_spd', binding: 'vehicle.speed', title: 'Speed' },
  { id: 'b_t_rpm', binding: 'engine.rpm', title: 'Rpm' },
  { id: 'b_t_gear', binding: 'transmission.gear', title: 'Gear' },
  { id: 'b_t_thr', binding: 'vehicle.throttle', title: 'Throttle', suffix: '%' },
  { id: 'b_t_brk', binding: 'vehicle.brake', title: 'Brake', suffix: '%' },
  { id: 'b_t_tur', binding: 'engine.turbo_pressure', title: 'Turbo' },
  { id: 'b_t_wat', binding: 'engine.water_temperature', title: 'Water' },
  { id: 'b_t_pos', binding: 'session.position', title: 'Position' }
]

export function benchExtraScreen(
  pattern: BenchPatternId,
  context: BenchPatternContext
): WidgetConfiguration[] {
  return pattern === 'full_screen_bar' ? fullScreenBar(context) : textOnly(context)
}

function fullScreenBar(context: BenchPatternContext): WidgetConfiguration[] {
  const { layout } = context
  return [
    bar('b_bar_full', layout.tile(0, 0, 12, 8), {
      binding: 'engine.turbo_pressure',
      minimum: 0,
      maximum: 210,
      orientation: 'horizontal',
      fill: BENCH_COLORS.cyan,
      gradient: BENCH_COLORS.rose
    }),
    bar('b_bar_thr', layout.tile(0, 8, 6, 2), {
      binding: 'vehicle.throttle',
      minimum: 0,
      maximum: 100,
      orientation: 'horizontal',
      fill: BENCH_COLORS.emerald
    }),
    valueText(context, 'b_val_tur', layout.tile(6, 8, 6, 2), 'engine.turbo_pressure', {
      title: 'Turbo',
      alignment: 'center'
    })
  ]
}

function textOnly(context: BenchPatternContext): WidgetConfiguration[] {
  const { layout, fonts } = context
  const sizes = [fonts.value, fonts.caption, fonts.value, fonts.title]
  return TEXT_FIELDS.map((field, index) => {
    const column = (index % 2) * 6
    const row = Math.floor(index / 2) * 2 + 1
    return valueText(context, field.id, layout.tile(column, row, 6, 2), field.binding, {
      title: field.title,
      alignment: 'right',
      size: sizes[index % sizes.length],
      ...(field.suffix ? { suffix: field.suffix } : {})
    })
  })
}
