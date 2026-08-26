import type { DisplayDescriptor } from '@shared/device'

import type { Placement } from './canvas-geometry'
import type { SnapField } from './snapping'

export interface SnapEdge {
  position: number
  box?: Placement
  id?: string
}

export function edgesOf(field: SnapField, display: DisplayDescriptor): {
  x: SnapEdge[]
  y: SnapEdge[]
} {
  const x: SnapEdge[] = []
  const y: SnapEdge[] = []
  const addBox = (box: Placement, id?: string): void => {
    x.push(
      { position: box.x, box, id },
      { position: box.x + box.width / 2, box, id },
      { position: box.x + box.width, box, id }
    )
    y.push(
      { position: box.y, box, id },
      { position: box.y + box.height / 2, box, id },
      { position: box.y + box.height, box, id }
    )
  }
  for (const sibling of field.siblings) addBox(sibling.box, sibling.id)
  addBox(field.bounds)
  if (field.inner) addBox(field.inner)
  x.push({ position: 0 }, { position: display.width / 2 }, { position: display.width })
  y.push({ position: 0 }, { position: display.height / 2 }, { position: display.height })
  return { x, y }
}

interface AxisGeometry {
  start: number
  size: number
}

export const axisOf = (box: Placement, axis: 'x' | 'y'): AxisGeometry =>
  axis === 'x'
    ? { start: box.x, size: box.width }
    : { start: box.y, size: box.height }

function overlapsAcross(a: Placement, b: Placement, axis: 'x' | 'y'): boolean {
  const across = axis === 'x' ? 'y' : 'x'
  const first = axisOf(a, across)
  const second = axisOf(b, across)
  return first.start < second.start + second.size && second.start < first.start + first.size
}

export interface EdgeMatch {
  value: number
  edge: SnapEdge
  distance: number
}

export function nearestEdge(
  start: number,
  offsets: readonly number[],
  edges: readonly SnapEdge[],
  tolerance: number
): EdgeMatch | undefined {
  let best: EdgeMatch | undefined
  for (const offset of offsets) {
    for (const edge of edges) {
      const value = edge.position - offset
      const distance = Math.abs(value - start)
      if (distance > tolerance) continue
      if (!best || distance < best.distance) best = { value, edge, distance }
    }
  }
  return best
}

export interface Neighbours {
  before?: { id: string; box: Placement }
  after?: { id: string; box: Placement }
}

export function neighboursOf(
  box: Placement,
  field: SnapField,
  axis: 'x' | 'y'
): Neighbours {
  const own = axisOf(box, axis)
  let before: { id: string; box: Placement } | undefined
  let after: { id: string; box: Placement } | undefined
  for (const sibling of field.siblings) {
    if (!overlapsAcross(box, sibling.box, axis)) continue
    const other = axisOf(sibling.box, axis)
    const far = other.start + other.size
    if (far <= own.start) {
      if (!before || far > axisOf(before.box, axis).start + axisOf(before.box, axis).size) {
        before = sibling
      }
    } else if (other.start >= own.start + own.size) {
      if (!after || other.start < axisOf(after.box, axis).start) after = sibling
    }
  }
  return { before, after }
}

export function knownGaps(box: Placement, field: SnapField, axis: 'x' | 'y'): number[] {
  const row = field.siblings
    .filter((sibling) => overlapsAcross(box, sibling.box, axis))
    .map((sibling) => axisOf(sibling.box, axis))
    .sort((first, second) => first.start - second.start)
  const gaps = new Set<number>()
  for (let index = 1; index < row.length; ++index) {
    const previous = row[index - 1] as AxisGeometry
    const current = row[index] as AxisGeometry
    const gap = Math.round(current.start - (previous.start + previous.size))
    if (gap > 0) gaps.add(gap)
  }
  return [...gaps]
}

export interface GapMatch {
  value: number
  distance: number
  gap: number
  against: { id: string; box: Placement }
  side: 'before' | 'after'
}

export function nearestGap(
  start: number,
  size: number,
  box: Placement,
  field: SnapField,
  axis: 'x' | 'y',
  tolerance: number
): GapMatch | undefined {
  const { before, after } = neighboursOf(box, field, axis)
  const gaps = knownGaps(box, field, axis)
  const candidates: GapMatch[] = []
  const consider = (
    value: number,
    gap: number,
    against: { id: string; box: Placement } | undefined,
    side: 'before' | 'after'
  ): void => {
    if (!against || gap <= 0) return
    const distance = Math.abs(value - start)
    if (distance > tolerance) return
    candidates.push({ value, distance, gap, against, side })
  }
  if (before) {
    const edge = axisOf(before.box, axis)
    for (const gap of gaps) consider(edge.start + edge.size + gap, gap, before, 'before')
  }
  if (after) {
    const edge = axisOf(after.box, axis)
    for (const gap of gaps) consider(edge.start - gap - size, gap, after, 'after')
  }
  if (before && after) {
    const left = axisOf(before.box, axis)
    const right = axisOf(after.box, axis)
    const free = right.start - (left.start + left.size) - size
    if (free > 0) {
      const gap = Math.round(free / 2)
      consider(left.start + left.size + gap, gap, before, 'before')
    }
  }
  return candidates.sort((first, second) => first.distance - second.distance)[0]
}

export const snapToGrid = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : value
