import type { DisplayDescriptor } from '@shared/device'

import { clamp, clampToDisplay } from '../editor/placement'
import type { Placement, ResizeMode } from './canvas-geometry'

// Where a dragged or resized box wants to land, and why.
//
// Three kinds of answer, in the order they are preferred. An **edge** lines the
// box up with something already on the screen — a neighbour's edge or centre,
// the container it sits in, the display itself. A **gap** repeats a distance
// that already exists, so a third tile lands the same distance from the second
// as the second is from the first. The **grid** is what catches everything
// else: a step the author picked, applied only where nothing better was found,
// because a widget that lines up with its neighbour matters more than a widget
// whose coordinate is a round number.
//
// Everything here is pure geometry in logical display pixels. It reads no
// document, no store and no React state: the canvas resolves what a gesture
// means and hands the answer to an editor command.

/** A line a box may line up with, and the box that put it there. */
export interface SnapEdge {
  position: number
  /**
   * What the line belongs to, so a guide can be drawn only as far as the two
   * boxes reach. Absent for the display's own edges and centre, which belong to
   * everything.
   */
  box?: Placement
  /** The widget the line came from, so the canvas can point at it. */
  id?: string
}

/**
 * The level a box is being moved within: its siblings and the area holding
 * them. A widget only ever lines up inside its own parent — a readout in a
 * panel has nothing to do with a readout in the panel next to it, and treating
 * the whole screen as one level made a container's contents jump to lines that
 * were nowhere near them.
 */
export interface SnapField {
  siblings: readonly { id: string; box: Placement }[]
  /** The container's box, or the display when the level is a screen. */
  bounds: Placement
  /** The container's content area — its box less border and padding. */
  inner?: Placement
}

export type SnapMode = 'all' | 'grid' | 'none'

export interface SnapPreferences {
  /** Step in logical pixels; zero when the grid is off. */
  grid: number
  /** How far a box reaches for a line, in logical pixels. */
  tolerance: number
  widgets: boolean
  spacing: boolean
  /** What the held modifiers have left of all that. */
  mode: SnapMode
}

/** A line drawn while the gesture runs, spanning only what it relates. */
export interface SnapGuide {
  /** `x` is a vertical line at `position`, spanning `from`..`to` down the screen. */
  axis: 'x' | 'y'
  position: number
  from: number
  to: number
}

/** A measured distance between two boxes, drawn with its number. */
export interface GapLabel {
  /** `x` measures horizontally between `from` and `to`, at height `at`. */
  axis: 'x' | 'y'
  from: number
  to: number
  at: number
  distance: number
  /** Whether this gap is one the box snapped to rather than one it merely has. */
  matched: boolean
}

export interface SnapResolution {
  placement: Placement
  guides: SnapGuide[]
  gaps: GapLabel[]
  /** Widgets the box lined up with, which the canvas outlines. */
  highlighted: string[]
}

export const DEFAULT_SNAP_TOLERANCE_PX = 10

const NOTHING: Omit<SnapResolution, 'placement'> = { guides: [], gaps: [], highlighted: [] }

/**
 * The lines one level offers, per axis. Every sibling contributes its two edges
 * and its centre; so do the container's outer box and its content area, and the
 * display when the level is the screen itself.
 */
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
  // The container's own box and the area inside its padding, which is where its
  // contents are meant to sit.
  addBox(field.bounds)
  if (field.inner) addBox(field.inner)
  // A widget on a screen also has the display, which is the same three lines
  // per axis the bounds already gave — so this only matters inside a container,
  // where the display's centre is still worth reaching for.
  x.push({ position: 0 }, { position: display.width / 2 }, { position: display.width })
  y.push({ position: 0 }, { position: display.height / 2 }, { position: display.height })
  return { x, y }
}

interface AxisGeometry {
  /** Where the box starts along this axis, and how long it is. */
  start: number
  size: number
}

const axisOf = (box: Placement, axis: 'x' | 'y'): AxisGeometry =>
  axis === 'x'
    ? { start: box.x, size: box.width }
    : { start: box.y, size: box.height }

/** Whether two boxes overlap on the axis a measurement is *not* taken along. */
function overlapsAcross(a: Placement, b: Placement, axis: 'x' | 'y'): boolean {
  const across = axis === 'x' ? 'y' : 'x'
  const first = axisOf(a, across)
  const second = axisOf(b, across)
  return first.start < second.start + second.size && second.start < first.start + first.size
}

interface EdgeMatch {
  value: number
  edge: SnapEdge
  distance: number
}

/**
 * The nearest line to one coordinate. `offsets` are the distances from the
 * box's origin to each of its own edges, so one call tries left, centre and
 * right at once and the closest of the nine combinations wins.
 */
function nearestEdge(
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

interface Neighbours {
  before?: { id: string; box: Placement }
  after?: { id: string; box: Placement }
}

/**
 * The siblings immediately before and after a box along one axis, counting only
 * those it stands beside — a widget two rows down is not what a gap is measured
 * against.
 */
function neighboursOf(
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

/**
 * The distances that already exist between neighbours on this axis, which is
 * what makes a third tile land the same distance from the second as the second
 * is from the first. Bounded: a row of twenty tiles offers at most twenty
 * gaps, and only the distinct ones are worth trying.
 */
function knownGaps(box: Placement, field: SnapField, axis: 'x' | 'y'): number[] {
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

interface GapMatch {
  value: number
  distance: number
  gap: number
  against: { id: string; box: Placement }
  side: 'before' | 'after'
}

/**
 * Where the box would sit if the gap to one of its neighbours repeated a gap
 * the row already has — or, with a neighbour on each side, if the two were
 * equal. The centred case is the one that makes a widget sit evenly between
 * two others without any arithmetic.
 */
function nearestGap(
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
  // Equal on both sides: the space left over, halved.
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

const snapToGrid = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : value

/** A guide covering both boxes, or just the moving one against the display. */
function guideFor(axis: 'x' | 'y', position: number, moving: Placement, edge: SnapEdge): SnapGuide {
  const across = axis === 'x' ? 'y' : 'x'
  const own = axisOf(moving, across)
  const other = edge.box ? axisOf(edge.box, across) : own
  return {
    axis,
    position,
    from: Math.min(own.start, other.start),
    to: Math.max(own.start + own.size, other.start + other.size)
  }
}

/** A measured gap between the moving box and one neighbour, with its number. */
function gapLabel(
  axis: 'x' | 'y',
  moving: Placement,
  other: Placement,
  matched: boolean
): GapLabel | undefined {
  const own = axisOf(moving, axis)
  const across = axisOf(moving, axis === 'x' ? 'y' : 'x')
  const neighbour = axisOf(other, axis)
  const from = neighbour.start >= own.start + own.size
    ? own.start + own.size
    : neighbour.start + neighbour.size
  const to = neighbour.start >= own.start + own.size ? neighbour.start : own.start
  const distance = Math.round(to - from)
  if (distance < 0) return undefined
  return { axis, from, to, at: Math.round(across.start + across.size / 2), distance, matched }
}

interface AxisResolution {
  start: number
  guide?: SnapGuide
  gaps: GapLabel[]
  highlighted: string[]
}

/**
 * One axis of a move: an edge first, a repeated gap second, the grid last.
 * The order is the whole rule — a line the author can see beats a number they
 * cannot.
 */
function resolveAxis(
  raw: number,
  moving: Placement,
  axis: 'x' | 'y',
  edges: readonly SnapEdge[],
  field: SnapField,
  preferences: SnapPreferences
): AxisResolution {
  const size = axisOf(moving, axis).size
  const at = (start: number): Placement =>
    axis === 'x' ? { ...moving, x: start } : { ...moving, y: start }
  if (preferences.mode === 'none') {
    return { start: Math.round(raw), gaps: measureGaps(at(raw), field, axis, false), highlighted: [] }
  }
  if (preferences.mode === 'all' && preferences.widgets) {
    const edge = nearestEdge(raw, [0, size / 2, size], edges, preferences.tolerance)
    if (edge) {
      const placed = at(edge.value)
      return {
        start: Math.round(edge.value),
        guide: guideFor(axis, edge.edge.position, placed, edge.edge),
        gaps: measureGaps(placed, field, axis, false),
        highlighted: edge.edge.id ? [edge.edge.id] : []
      }
    }
  }
  if (preferences.mode === 'all' && preferences.spacing) {
    const gap = nearestGap(raw, size, moving, field, axis, preferences.tolerance)
    if (gap) {
      const placed = at(gap.value)
      return {
        start: Math.round(gap.value),
        gaps: measureGaps(placed, field, axis, true),
        highlighted: [gap.against.id]
      }
    }
  }
  const grid = snapToGrid(raw, preferences.grid)
  return {
    start: Math.round(grid),
    gaps: measureGaps(at(grid), field, axis, false),
    highlighted: []
  }
}

/** The distances to whatever now stands on either side, for the readout. */
function measureGaps(
  moving: Placement,
  field: SnapField,
  axis: 'x' | 'y',
  matched: boolean
): GapLabel[] {
  const { before, after } = neighboursOf(moving, field, axis)
  return [before, after]
    .filter((entry): entry is { id: string; box: Placement } => entry !== undefined)
    .map((entry) => gapLabel(axis, moving, entry.box, matched))
    .filter((label): label is GapLabel => label !== undefined && label.distance > 0)
}

export function resolveMove(
  original: Placement,
  dx: number,
  dy: number,
  field: SnapField,
  display: DisplayDescriptor,
  preferences: SnapPreferences
): SnapResolution {
  const moving = { ...original, x: original.x + dx, y: original.y + dy }
  const edges = edgesOf(field, display)
  const horizontal = resolveAxis(moving.x, moving, 'x', edges.x, field, preferences)
  const vertical = resolveAxis(moving.y, moving, 'y', edges.y, field, preferences)
  const placement = {
    ...original,
    ...clampToDisplay(horizontal.start, vertical.start, original.width, original.height, display)
  }
  return {
    placement,
    guides: [horizontal.guide, vertical.guide].filter(
      (guide): guide is SnapGuide => guide !== undefined
    ),
    gaps: [...horizontal.gaps, ...vertical.gaps],
    highlighted: [...new Set([...horizontal.highlighted, ...vertical.highlighted])]
  }
}

/** The floor a box may be resized to, shared by the pointer and the keyboard. */
export const MINIMUM_SIZE_PX = 8

export interface ResizeOptions {
  /** Shift: the box keeps the proportions it started with. */
  proportional: boolean
  /** Alt: the box grows from its centre rather than from the opposite edge. */
  fromCenter: boolean
}

/**
 * One edge of a resize. Only the edge being dragged snaps, and it snaps to the
 * same three kinds of answer a move does — which is the whole point of this
 * work: an edge that could only find the grid left every layout half a pixel
 * short of the neighbour it was meant to meet.
 */
function resolveEdge(
  raw: number,
  moving: Placement,
  axis: 'x' | 'y',
  edges: readonly SnapEdge[],
  field: SnapField,
  preferences: SnapPreferences,
  side: 'near' | 'far'
): { value: number; guide?: SnapGuide; highlighted?: string; matchedGap: boolean } {
  if (preferences.mode === 'none') return { value: Math.round(raw), matchedGap: false }
  if (preferences.mode === 'all' && preferences.widgets) {
    const edge = nearestEdge(raw, [0], edges, preferences.tolerance)
    if (edge) {
      return {
        value: Math.round(edge.value),
        guide: guideFor(axis, edge.edge.position, moving, edge.edge),
        highlighted: edge.edge.id,
        matchedGap: false
      }
    }
  }
  if (preferences.mode === 'all' && preferences.spacing) {
    // A dragged edge repeats a gap the row already has: the distance from the
    // neighbour on that side, rather than a position of its own.
    const { before, after } = neighboursOf(moving, field, axis)
    const against = side === 'near' ? before : after
    if (against) {
      const other = axisOf(against.box, axis)
      for (const gap of knownGaps(moving, field, axis).sort()) {
        const value = side === 'near' ? other.start + other.size + gap : other.start - gap
        if (Math.abs(value - raw) <= preferences.tolerance) {
          return { value: Math.round(value), highlighted: against.id, matchedGap: true }
        }
      }
    }
  }
  return { value: Math.round(snapToGrid(raw, preferences.grid)), matchedGap: false }
}

export function resolveResize(
  original: Placement,
  mode: ResizeMode,
  dx: number,
  dy: number,
  field: SnapField,
  display: DisplayDescriptor,
  preferences: SnapPreferences,
  options: ResizeOptions
): SnapResolution {
  const edges = edgesOf(field, display)
  const guides: SnapGuide[] = []
  const highlighted: string[] = []
  let left = original.x
  let top = original.y
  let right = original.x + original.width
  let bottom = original.y + original.height
  // From the centre means the opposite edge moves with the dragged one, so a
  // box grows around what it is centred on.
  const mirror = options.fromCenter ? -1 : 0

  const take = (
    result: ReturnType<typeof resolveEdge>
  ): number => {
    if (result.guide) guides.push(result.guide)
    if (result.highlighted) highlighted.push(result.highlighted)
    return result.value
  }

  if (mode.includes('w')) {
    left = take(resolveEdge(original.x + dx, original, 'x', edges.x, field, preferences, 'near'))
    if (mirror) right = original.x + original.width - (left - original.x)
  }
  if (mode.includes('e')) {
    right = take(
      resolveEdge(original.x + original.width + dx, original, 'x', edges.x, field, preferences, 'far')
    )
    if (mirror) left = original.x - (right - original.x - original.width)
  }
  if (mode.includes('n')) {
    top = take(resolveEdge(original.y + dy, original, 'y', edges.y, field, preferences, 'near'))
    if (mirror) bottom = original.y + original.height - (top - original.y)
  }
  if (mode.includes('s')) {
    bottom = take(
      resolveEdge(original.y + original.height + dy, original, 'y', edges.y, field, preferences, 'far')
    )
    if (mirror) top = original.y - (bottom - original.y - original.height)
  }

  let width = Math.max(MINIMUM_SIZE_PX, right - left)
  let height = Math.max(MINIMUM_SIZE_PX, bottom - top)
  if (options.proportional && original.width > 0 && original.height > 0) {
    // The axis that moved further decides, so a corner drag follows the pointer
    // rather than the smaller of the two edges.
    const ratio = original.width / original.height
    if (Math.abs(width - original.width) >= Math.abs(height - original.height)) {
      height = Math.max(MINIMUM_SIZE_PX, Math.round(width / ratio))
    } else {
      width = Math.max(MINIMUM_SIZE_PX, Math.round(height * ratio))
    }
    // Whichever edges are being dragged stay put; the free ones follow.
    if (mode.includes('w')) left = right - width
    if (mode.includes('n')) top = bottom - height
    if (options.fromCenter) {
      left = Math.round(original.x + original.width / 2 - width / 2)
      top = Math.round(original.y + original.height / 2 - height / 2)
    }
  }
  // Never off the display, and never past the opposite edge.
  const x = clamp(Math.round(left), 0, Math.max(0, display.width - MINIMUM_SIZE_PX))
  const y = clamp(Math.round(top), 0, Math.max(0, display.height - MINIMUM_SIZE_PX))
  const placement = {
    x,
    y,
    width: clamp(Math.round(width), MINIMUM_SIZE_PX, Math.max(MINIMUM_SIZE_PX, display.width - x)),
    height: clamp(Math.round(height), MINIMUM_SIZE_PX, Math.max(MINIMUM_SIZE_PX, display.height - y))
  }
  return {
    placement,
    guides,
    gaps: [
      ...measureGaps(placement, field, 'x', false),
      ...measureGaps(placement, field, 'y', false)
    ],
    highlighted: [...new Set(highlighted)]
  }
}

/** A box with no snapping applied at all, for a gesture that asked for none. */
export function plain(placement: Placement): SnapResolution {
  return { placement, ...NOTHING }
}

/**
 * One corner of a box being drawn. A tool places both corners the same way a
 * move places an edge — against the neighbours first, the grid second — so a
 * widget drawn beside another starts out aligned with it rather than needing to
 * be nudged into place afterwards.
 */
export function snapPoint(
  point: { x: number; y: number },
  field: SnapField,
  display: DisplayDescriptor,
  preferences: SnapPreferences
): { x: number; y: number; guides: SnapGuide[]; highlighted: string[] } {
  const edges = edgesOf(field, display)
  const guides: SnapGuide[] = []
  const highlighted: string[] = []
  const resolve = (value: number, axis: 'x' | 'y'): number => {
    if (preferences.mode === 'none') return Math.round(value)
    if (preferences.mode === 'all' && preferences.widgets) {
      const match = nearestEdge(value, [0], edges[axis], preferences.tolerance)
      if (match) {
        const dot = { x: point.x, y: point.y, width: 0, height: 0 }
        guides.push(guideFor(axis, match.edge.position, dot, match.edge))
        if (match.edge.id) highlighted.push(match.edge.id)
        return Math.round(match.value)
      }
    }
    return Math.round(snapToGrid(value, preferences.grid))
  }
  return {
    x: clamp(resolve(point.x, 'x'), 0, display.width),
    y: clamp(resolve(point.y, 'y'), 0, display.height),
    guides,
    highlighted: [...new Set(highlighted)]
  }
}
