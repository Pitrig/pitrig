import type { FillCorners, WidgetInsets } from '@shared/configuration-schema'
import { normalizeColor } from './preview-values'
import type { Placement } from './canvas-geometry'

export function squareFill(configuration: {
  fill_corners?: FillCorners
  border?: { radius_px?: number }
}): boolean {
  return (
    configuration.fill_corners === 'square' && (configuration.border?.radius_px ?? 0) !== 0
  )
}

export function contentArea(
  placement: Placement,
  border: number,
  padding: WidgetInsets | undefined
): Placement {
  const left = padding?.left ?? 0
  const top = padding?.top ?? 0
  const right = padding?.right ?? 0
  const bottom = padding?.bottom ?? 0
  return {
    x: placement.x + border + left,
    y: placement.y + border + top,
    width: Math.max(0, placement.width - 2 * border - left - right),
    height: Math.max(0, placement.height - 2 * border - top - bottom)
  }
}

export function backgroundRect(
  placement: Placement,
  border: number,
  radius: number,
  inset: number
): Placement & { rx: number } {
  const edge = inset > 0 ? border + inset : 0
  return {
    x: placement.x + edge,
    y: placement.y + edge,
    width: Math.max(0, placement.width - 2 * edge),
    height: Math.max(0, placement.height - 2 * edge),
    rx: Math.max(0, radius - inset)
  }
}

export function paintedColor(color: string | undefined): string | undefined {
  const normalized = normalizeColor(color)
  return normalized === undefined || normalized === 'transparent' ? undefined : normalized
}

export function gradientPaint(
  id: string,
  color: string,
  gradientColor: string | undefined
): { paint: string; definition: boolean } {
  const far = normalizeColor(gradientColor)
  const gradient = far !== undefined && far !== 'transparent' && color !== 'transparent'
  return { paint: gradient ? `url(#${id})` : color, definition: gradient }
}
