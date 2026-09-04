import type { RingCentering } from '@shared/configuration-schema'

export interface Ring {
  radius: number
  centerX: number
  centerY: number
}

export function fittedRingRadius(
  plot: { width: number; height: number },
  thickness: number
): number {
  return Math.max(0, Math.min(plot.width, plot.height) / 2 - thickness / 2)
}

export function ringGeometry(
  plot: { x: number; y: number; width: number; height: number },
  thickness: number,
  configuration: {
    radius_px?: number
    x_offset_px?: number
    y_offset_px?: number
    center_angle_deg?: number
    sector_deg?: number
    centering?: RingCentering
  }
): Ring {
  const authored = configuration.radius_px ?? 0
  const radius = authored !== 0 ? Math.max(0, authored) : fittedRingRadius(plot, thickness)
  const sector = Math.min(configuration.sector_deg ?? 270, 360)
  const offset =
    configuration.centering === 'figure'
      ? figureOffset(sectorStart(configuration.center_angle_deg ?? 270, sector), sector, radius, thickness)
      : { x: 0, y: 0 }
  return {
    radius,
    centerX: plot.x + plot.width / 2 + (configuration.x_offset_px ?? 0) - offset.x,
    centerY: plot.y + plot.height / 2 + (configuration.y_offset_px ?? 0) - offset.y
  }
}

export function sectorStart(centerDegrees: number, sectorDegrees: number): number {
  const start = centerDegrees - sectorDegrees / 2
  return start < 0 ? start + 360 : start
}

function polar(radius: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) }
}

function insideSector(startDegrees: number, sectorDegrees: number, degrees: number): boolean {
  const travelled = (((degrees - startDegrees) % 360) + 360) % 360
  return travelled <= sectorDegrees
}

export function figureOffset(
  startDegrees: number,
  sectorDegrees: number,
  radius: number,
  thickness: number
): { x: number; y: number } {
  const outer = radius + thickness / 2
  const inner = Math.max(radius - thickness / 2, 0)
  const points = [startDegrees, startDegrees + sectorDegrees].flatMap((degrees) => [
    polar(outer, degrees),
    polar(inner, degrees)
  ])
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const degrees = 90 * quarter
    if (insideSector(startDegrees, sectorDegrees, degrees)) points.push(polar(outer, degrees))
  }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2
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
  centerDegrees: number,
  sectorDegrees: number,
  gapPixels: number,
  radius: number
): ArcSlice[] {
  if (count <= 0 || radius <= 0) return []
  const wantedGap = (gapPixels * 180) / (Math.PI * radius)
  const smallestGap = gapPixels > 0 ? 1 : 0
  const gap = Math.max(Math.round(wantedGap), smallestGap)
  const spent = gap * (count - 1)
  const exact = (sectorDegrees - spent) / count
  if (exact < 0.5) return []
  const shortest = Math.max(Math.floor(exact), 1)
  let best: { length: number; gap: number; total: number } | undefined
  for (let length = shortest; length <= shortest + 1; length += 1) {
    const total = length * count + spent
    if (total > 360) continue
    if (best !== undefined) {
      const error = Math.abs(sectorDegrees - total)
      const bestError = Math.abs(sectorDegrees - best.total)
      if (error > bestError || (error === bestError && total >= best.total)) continue
    }
    best = { length, gap, total }
  }
  if (best === undefined) return []
  const slices = best
  const start = centerDegrees - Math.trunc(slices.total / 2)
  return Array.from({ length: count }, (_, index) => ({
    start: start + index * (slices.length + slices.gap),
    sweep: slices.length
  }))
}
