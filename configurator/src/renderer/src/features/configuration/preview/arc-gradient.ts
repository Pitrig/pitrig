import { fillRampColor } from '@shared/color-ramp'
import type { RgbColor } from '@shared/configuration-schema'
import { arcPath } from './arc-geometry'

export interface GradientArcSegment {
  d: string
  color: string
}

export interface GradientArc {
  centerX: number
  centerY: number
  radius: number
  sectorStart: number
  sectorDegrees: number
  fillStart: number
  sweptDegrees: number
  inverted: boolean
  from: RgbColor
  via: RgbColor | undefined
  to: RgbColor
}

const SEGMENT_DEGREES = 2
const OVERLAP_DEGREES = 0.75

export function gradientArcSegments(arc: GradientArc): GradientArcSegment[] {
  if (arc.sweptDegrees <= 0 || arc.sectorDegrees <= 0) return []
  const count = Math.max(1, Math.ceil(arc.sweptDegrees / SEGMENT_DEGREES))
  const step = arc.sweptDegrees / count
  const entered = arc.fillStart - arc.sectorStart
  return Array.from({ length: count }, (_, index) => {
    const begin = arc.fillStart + index * step
    const end = index === count - 1 ? arc.fillStart + arc.sweptDegrees : begin + step + OVERLAP_DEGREES
    const along = (entered + (index + 0.5) * step) / arc.sectorDegrees
    return {
      d: arcPath(arc.centerX, arc.centerY, arc.radius, begin, end - begin),
      color: fillRampColor(arc.from, arc.via, arc.to, arc.inverted ? 1 - along : along)
    }
  })
}
