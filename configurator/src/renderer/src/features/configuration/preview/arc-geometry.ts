export interface Ring {
  radius: number
  centerX: number
  centerY: number
}

export function ringGeometry(
  plot: { x: number; y: number; width: number; height: number },
  thickness: number,
  configuration: { radius_px?: number; center_x_px?: number; center_y_px?: number }
): Ring {
  const fitted = Math.min(plot.width, plot.height) / 2 - thickness / 2
  const authored = configuration.radius_px ?? 0
  return {
    radius: Math.max(0, authored !== 0 ? authored : fitted),
    centerX: plot.x + plot.width / 2 + (configuration.center_x_px ?? 0),
    centerY: plot.y + plot.height / 2 + (configuration.center_y_px ?? 0)
  }
}

export interface ArcSlice {
  start: number
  sweep: number
}

export function arcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startDegrees: number,
  sweepDegrees: number
): string {
  const point = (degrees: number): [number, number] => {
    const radians = (degrees * Math.PI) / 180
    return [centerX + radius * Math.cos(radians), centerY + radius * Math.sin(radians)]
  }
  if (sweepDegrees >= 360) {
    const [x, y] = point(startDegrees)
    const [oppositeX, oppositeY] = point(startDegrees + 180)
    return `M ${x} ${y} A ${radius} ${radius} 0 1 1 ${oppositeX} ${oppositeY} A ${radius} ${radius} 0 1 1 ${x} ${y}`
  }
  const [startX, startY] = point(startDegrees)
  const [endX, endY] = point(startDegrees + sweepDegrees)
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${sweepDegrees > 180 ? 1 : 0} 1 ${endX} ${endY}`
}

export function needlePoints(
  centerX: number,
  centerY: number,
  radius: number,
  degrees: number
): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (degrees * Math.PI) / 180
  return {
    x1: centerX,
    y1: centerY,
    x2: centerX + radius * Math.cos(radians),
    y2: centerY + radius * Math.sin(radians)
  }
}

export function arcSlices(
  count: number,
  startDegrees: number,
  sweepDegrees: number,
  gapPixels: number,
  radius: number
): ArcSlice[] {
  if (count <= 0 || radius <= 0) return []
  const gap = (gapPixels * 180) / (Math.PI * radius)
  const length = (sweepDegrees - gap * (count - 1)) / count
  if (length <= 0) return []
  return Array.from({ length: count }, (_, index) => ({
    start: startDegrees + index * (length + gap),
    sweep: length
  }))
}
