/**
 * What the device would measure for a string. The board asks LVGL for a text
 * width and a line height and lays the widget out from those, so the canvas has
 * to ask the same questions of the same face rather than positioning glyphs by
 * their nominal size — a value centred on `size_px` sits visibly off the one
 * centred on the line box.
 *
 * The answers come from the browser's own shaping of the uploaded face, so they
 * match LVGL's to within its rasterizer's rounding rather than exactly.
 */
export interface GlyphMetrics {
  /** Advance width of the string. */
  width: number
  /** Distance from the top of the line box to the baseline. */
  ascent: number
  /** What LVGL reports as the font's line height. */
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

/**
 * The fallback for a browser that reports no font box, which is also what the
 * canvas used before it had the uploaded face to measure.
 */
function estimatedMetrics(text: string, sizePx: number): GlyphMetrics {
  return { width: text.length * sizePx * 0.62, ascent: sizePx * 0.8, lineHeight: sizePx * 1.2 }
}
