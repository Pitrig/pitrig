import type { DisplayDescriptor } from '@shared/device'

import { clamp } from '../editor/placement'
import type { Placement, ResizeMode } from './canvas-geometry'
import {
  axisOf,
  edgesOf,
  knownGaps,
  nearestEdge,
  neighboursOf,
  snapToGrid,
  type SnapEdge
} from './snap-lines'
import {
  guideFor,
  measureGaps,
  type SnapField,
  type SnapGuide,
  type SnapPreferences,
  type SnapResolution
} from './snapping'

// The resize half of snapping: only the dragged edge snaps, and it snaps to
// the same three kinds of answer a move does. Split from snapping.ts so the
// move and the resize each read as one rule.

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
