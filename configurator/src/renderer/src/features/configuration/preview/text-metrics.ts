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

const MAXIMUM_CACHED_METRICS = 4096

const measured = new Map<string, GlyphMetrics>()

export function measureGlyphs(
  text: string,
  family: string,
  sizePx: number,
  weight: number
): GlyphMetrics {
  const key = `${weight}|${sizePx}|${family}|${text}`
  const cached = measured.get(key)
  if (cached) return cached
  const metrics = measureUncached(text, family, sizePx, weight)
  if (measured.size >= MAXIMUM_CACHED_METRICS) measured.clear()
  measured.set(key, metrics)
  return metrics
}

function measureUncached(
  text: string,
  family: string,
  sizePx: number,
  weight: number
): GlyphMetrics {
  const target = measurementContext()
  if (!target) return estimatedMetrics(text, sizePx)
  target.font = `${weight} ${sizePx}px ${family}`
  const metrics = target.measureText(text)
  const ascent = metrics.fontBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) {
    return estimatedMetrics(text, sizePx)
  }
  return { width: metrics.width, ascent, lineHeight: ascent + descent }
}

function estimatedMetrics(text: string, sizePx: number): GlyphMetrics {
  return { width: text.length * sizePx * 0.62, ascent: sizePx * 0.8, lineHeight: sizePx * 1.2 }
}
