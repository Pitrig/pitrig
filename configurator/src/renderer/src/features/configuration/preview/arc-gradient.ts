import { fillRampColor } from '@shared/color-ramp'
import type { RgbColor } from '@shared/configuration-schema'
import { arcPath } from './arc-geometry'

export interface GradientArcSegment {
  d: string
  color: string
}

const SEGMENT_DEGREES = 2
const OVERLAP_DEGREES = 0.75

export function gradientArcSegments(
  centerX: number,
  centerY: number,
  radius: number,
  startDegrees: number,
  sweptDegrees: number,
  sectorDegrees: number,
  from: RgbColor,
  via: RgbColor | undefined,
  to: RgbColor,
  inverted: boolean
): GradientArcSegment[] {
  if (sweptDegrees <= 0 || sectorDegrees <= 0) return []
  const count = Math.max(1, Math.ceil(sweptDegrees / SEGMENT_DEGREES))
  const step = sweptDegrees / count
  return Array.from({ length: count }, (_, index) => {
    const begin = startDegrees + index * step
    const end = index === count - 1 ? startDegrees + sweptDegrees : begin + step + OVERLAP_DEGREES
    const middle = ((index + 0.5) * step) / sectorDegrees
    const fraction = inverted ? 1 - middle : middle
    return {
      d: arcPath(centerX, centerY, radius, begin, end - begin),
      color: fillRampColor(from, via, to, fraction)
    }
  })
}
