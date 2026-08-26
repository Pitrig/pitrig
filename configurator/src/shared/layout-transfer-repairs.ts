import type { WidgetConfiguration } from './configuration-schema'

const DEFAULT_ARC_THICKNESS_PX = 8

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
