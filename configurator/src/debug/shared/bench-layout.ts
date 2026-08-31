import type {
  FontSpec,
  RgbColor,
  WidgetBorder,
  WidgetPlacement,
  WidgetTitleStyle
} from '@shared/configuration-schema'

export interface BenchBox {
  width: number
  height: number
}

export interface BenchFonts {
  value: number
  title: number
  caption: number
}

export interface BenchLayout {
  box: BenchBox
  columns: number
  rows: number
  tile: (col: number, row: number, colSpan: number, rowSpan: number) => WidgetPlacement
}

export const BENCH_COLORS = {
  screen: '#070a0f',
  panel: '#111827',
  panelEdge: '#1f2937',
  track: '#1e293b',
  text: '#e2e8f0',
  muted: '#94a3b8',
  cyan: '#22d3ee',
  amber: '#f59e0b',
  emerald: '#34d399',
  rose: '#fb7185',
  violet: '#a78bfa',
  blue: '#60a5fa'
} as const

export function benchLayout(box: BenchBox, columns: number, rows: number, gap: number): BenchLayout {
  const edge = (index: number, count: number, total: number): number =>
    Math.round((index * total) / count)
  return {
    box,
    columns,
    rows,
    tile: (col, row, colSpan, rowSpan) => {
      const left = edge(col, columns, box.width)
      const right = edge(Math.min(columns, col + colSpan), columns, box.width)
      const top = edge(row, rows, box.height)
      const bottom = edge(Math.min(rows, row + rowSpan), rows, box.height)
      return {
        x: left + gap,
        y: top + gap,
        width: Math.max(2, right - left - 2 * gap),
        height: Math.max(2, bottom - top - 2 * gap)
      }
    }
  }
}

export function benchFonts(height: number): BenchFonts {
  return {
    value: clamp(Math.round(height / 13), 11, 46),
    title: clamp(Math.round(height / 26), 8, 22),
    caption: clamp(Math.round(height / 20), 9, 30)
  }
}

export function benchGap(width: number): number {
  return width >= 900 ? 4 : width >= 460 ? 3 : 2
}

export function font(family: string, sizePx: number): FontSpec {
  return { family, size_px: sizePx }
}

export function caption(
  family: string | undefined,
  fonts: BenchFonts,
  text: string
): { title?: WidgetTitleStyle } {
  if (family === undefined) return {}
  return {
    title: {
      text: text.slice(0, 15),
      font: font(family, fonts.title),
      color: BENCH_COLORS.muted,
      alignment: 'top_left',
      border_gap: true
    }
  }
}

export function arcThickness(placement: WidgetPlacement): number {
  const shortest = Math.min(placement.width ?? 2, placement.height ?? 2)
  return clamp(Math.round(shortest / 8), 2, Math.max(2, Math.floor(shortest / 2) - 1))
}

export function panel(): { background_color: RgbColor; border: WidgetBorder } {
  return {
    background_color: BENCH_COLORS.panel,
    border: { color: BENCH_COLORS.panelEdge, width_px: 1, radius_px: 4 }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
