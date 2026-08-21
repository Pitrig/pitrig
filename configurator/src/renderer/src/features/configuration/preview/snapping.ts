import type { DisplayDescriptor } from '@shared/device'

import { clamp, clampToDisplay } from '../editor/placement'
import type { Placement } from './canvas-geometry'
import {
  axisOf,
  edgesOf,
  nearestEdge,
  nearestGap,
  neighboursOf,
  snapToGrid,
  type SnapEdge
} from './snap-lines'

export type { SnapEdge } from './snap-lines'
export { MINIMUM_SIZE_PX, resolveResize, type ResizeOptions } from './snap-resize'

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

/** A guide covering both boxes, or just the moving one against the display. */
export function guideFor(axis: 'x' | 'y', position: number, moving: Placement, edge: SnapEdge): SnapGuide {
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
export function measureGaps(
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
