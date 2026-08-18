import type { WidgetInsets } from '@shared/configuration-schema'
import { normalizeColor } from './preview-values'
import type { Placement } from './canvas-geometry'

// Geometry and paint arithmetic the previews share. Kept out of the component
// modules so those export components only, which is what lets fast refresh
// swap a renderer without reloading the editor.

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

/**
 * Where a widget's own fill lands. An inset background cannot be the
 * container's fill, which always reaches the border, so the device makes it a
 * child sized to leave exactly `inset` of frame showing; without an inset it is
 * the container itself and covers the whole box.
 */
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

/**
 * A linear gradient is two style properties on whichever object paints the
 * fill, so it is drawn as one: the authored colour is the near stop — which is
 * what a styling rule replaces — and the gradient colour is the far one.
 */

/** The paint for a fill that may carry a gradient, and the definition it needs. */
export function gradientPaint(
  id: string,
  color: string,
  gradientColor: string | undefined
): { paint: string; definition: boolean } {
  const far = normalizeColor(gradientColor)
  const gradient = far !== undefined && far !== 'transparent' && color !== 'transparent'
  return { paint: gradient ? `url(#${id})` : color, definition: gradient }
}

/**
 * The box every widget type carries: the fill the frame paints and the border
 * drawn inside the bounds. The device applies both from the shared frame before
 * a widget draws anything of its own, so this is drawn for every type — an arc
 * with a background used to show one on the board and nothing here.
 */
