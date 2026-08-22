import type { WidgetConfiguration } from './configuration-schema'

// What a resized box invalidates. Scaling a widget moves its placement and its
// pixel-valued properties through separate factors and rounds each on its own,
// so a relation that held between them before the move can stop holding after
// it. The device refuses such a document outright; these put it back inside the
// bound and report what they changed.
//
// The field tables that do the plain scaling are layout-transfer-fields.ts.
// Both the board transfer and an in-editor resize run these, because a property
// repaired in one place and not the other is exactly the disagreement the two
// share a table to avoid.

// The device's own default, which it applies to an arc that names no thickness
// — so a shrunk arc has to be repaired even when the property is absent.
const DEFAULT_ARC_THICKNESS_PX = 8

/**
 * The device refuses a frame whose border and inset together claim the whole
 * box: `2 * (inset + border)` has to stay under both sides. Scaling rounds the
 * box and the two widths independently and by different factors — a box follows
 * its axis, a width follows the smaller of the two — so a frame that fitted
 * before the move can stop fitting after it. An arc's thickness was not the
 * only single number a resized box can invalidate.
 *
 * The border is what the frame is seen by, so the inset gives way first and the
 * border keeps whatever the box still has room for.
 */
export function repairFrameInset(
  widget: WidgetConfiguration,
  clamped?: (field: string, from: number, to: number) => void
): void {
  const box = widget.placement
  const width = box?.width
  const height = box?.height
  if (typeof width !== 'number' || typeof height !== 'number') return
  const budget = Math.max(0, Math.floor((Math.min(width, height) - 1) / 2))
  const border = widget.border?.width_px ?? 0
  const inset = widget.background_inset_px ?? 0
  if (border + inset <= budget) return
  const nextBorder = Math.min(border, budget)
  const nextInset = Math.min(inset, budget - nextBorder)
  // Only ever written back when it was carried in the first place: an absent
  // property reads as zero, and zero always fits.
  if (nextBorder !== border && widget.border) {
    widget.border.width_px = nextBorder
    clamped?.('border.width_px', border, nextBorder)
  }
  if (nextInset !== inset) {
    widget.background_inset_px = nextInset
    clamped?.('background_inset_px', inset, nextInset)
  }
}

export function repairArcThickness(
  widget: WidgetConfiguration,
  reduced?: (from: number, to: number) => void
): void {
  if (widget.type !== 'arc') return
  const box = widget.placement
  const width = box?.width
  const height = box?.height
  if (typeof width !== 'number' || typeof height !== 'number') return
  const limit = Math.max(1, Math.floor(Math.min(width, height) / 2))
  const thickness = typeof widget.thickness_px === 'number'
    ? widget.thickness_px
    : DEFAULT_ARC_THICKNESS_PX
  if (thickness <= limit) return
  widget.thickness_px = limit
  reduced?.(thickness, limit)
}
