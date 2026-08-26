export interface GlyphMetrics {
  width: number
  ascent: number
  lineHeight: number
}

let context: CanvasRenderingContext2D | null | undefined

function measurementContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context = document.createElement('canvas').getContext('2d')
  }
  return context
}

export function measureGlyphs(
  text: string,
  family: string,
  sizePx: number,
  weight: number
): GlyphMetrics {
  const target = measurementContext()
  if (!target) return estimatedMetrics(text, sizePx)
  target.font = `${weight} ${sizePx}px ${family}`
  const measured = target.measureText(text)
  const ascent = measured.fontBoundingBoxAscent
  const descent = measured.fontBoundingBoxDescent
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
    return estimatedMetrics(text, sizePx)
  }
  return { width: measured.width, ascent, lineHeight: ascent + descent }
}

function estimatedMetrics(text: string, sizePx: number): GlyphMetrics {
  return { width: text.length * sizePx * 0.62, ascent: sizePx * 0.8, lineHeight: sizePx * 1.2 }
}
