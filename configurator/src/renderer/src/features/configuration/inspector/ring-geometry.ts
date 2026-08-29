export interface RingWidget {
  start_angle_deg?: number
  sweep_deg?: number
  thickness_px?: number
  radius_px?: number
  center_x_px?: number
  center_y_px?: number
  placement?: { width?: number; height?: number }
  border?: { width_px?: number }
  padding?: { left?: number; right?: number; top?: number; bottom?: number }
}

export function fittedRadius(widget: RingWidget, thickness: number): number {
  const border = 2 * (widget.border?.width_px ?? 0)
  const width = (widget.placement?.width ?? 0) - border - (widget.padding?.left ?? 0) - (widget.padding?.right ?? 0)
  const height = (widget.placement?.height ?? 0) - border - (widget.padding?.top ?? 0) - (widget.padding?.bottom ?? 0)
  return Math.max(0, Math.round(Math.min(width, height) / 2 - thickness / 2))
}

export function ringSummary(widget: RingWidget): string {
  const radius = widget.radius_px ?? 0
  const angles = `${widget.start_angle_deg ?? 135}° + ${widget.sweep_deg ?? 270}°`
  return radius === 0 ? angles : `${angles} · r${radius}`
}
