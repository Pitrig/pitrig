import { type DeviceConfiguration } from '@shared/device'
import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { absolutePlacement, ancestorsOf, findWidget, mutateDraftConfiguration, parentOffset, writePlacement } from './document'

// Lining widgets up and spacing them out. Both work in absolute display
// coordinates and write back in each widget's own parent space.

export type AlignmentEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributionAxis = 'horizontal' | 'vertical'

/**
 * Aligns every selected widget to the extreme of the group. Alignment reads the
 * group's own bounds rather than the display's, so aligning three readouts left
 * lines them up with the leftmost of the three, not with the screen edge.
 */
export function alignWidgets(ids: readonly string[], edge: AlignmentEdge): void {
  if (ids.length < 2) return
  mutateDraftConfiguration((configuration) => {
    const placed = selectedPlacements(configuration, ids)
    if (placed.length < 2) return
    const left = Math.min(...placed.map(({ placement }) => placement.x))
    const right = Math.max(...placed.map(({ placement }) => placement.x + placement.width))
    const top = Math.min(...placed.map(({ placement }) => placement.y))
    const bottom = Math.max(...placed.map(({ placement }) => placement.y + placement.height))
    applyPlacements(configuration, placed.map((entry) => {
      const { placement } = entry
      const next = { ...placement }
      if (edge === 'left') next.x = left
      else if (edge === 'right') next.x = right - placement.width
      else if (edge === 'center') next.x = Math.round((left + right - placement.width) / 2)
      else if (edge === 'top') next.y = top
      else if (edge === 'bottom') next.y = bottom - placement.height
      else next.y = Math.round((top + bottom - placement.height) / 2)
      return { ...entry, next }
    }))
  })
}

/**
 * Spreads the widgets between the two outermost ones so the gaps between them
 * are equal. The ends stay where they are, which is what makes the result
 * predictable: distributing twice changes nothing.
 */
export function distributeWidgets(ids: readonly string[], axis: DistributionAxis): void {
  if (ids.length < 3) return
  mutateDraftConfiguration((configuration) => {
    const placed = selectedPlacements(configuration, ids)
    if (placed.length < 3) return
    const horizontal = axis === 'horizontal'
    const ordered = [...placed].sort((left, right) =>
      horizontal ? left.placement.x - right.placement.x : left.placement.y - right.placement.y
    )
    const first = ordered[0]!.placement
    const last = ordered[ordered.length - 1]!.placement
    const span = horizontal
      ? last.x + last.width - first.x
      : last.y + last.height - first.y
    const occupied = ordered.reduce(
      (total, { placement }) => total + (horizontal ? placement.width : placement.height),
      0
    )
    const gap = (span - occupied) / (ordered.length - 1)
    const spanStart = horizontal ? first.x : first.y
    let cursor = spanStart
    let leavesSpan = false
    const targets = ordered.map((entry) => {
      const { placement } = entry
      const size = horizontal ? placement.width : placement.height
      // Half a pixel of slack, because the cursor is real-valued and the last
      // member lands on the far end exactly; the case this guards against
      // misses by tens of pixels.
      if (cursor < spanStart - 0.5 || cursor + size > spanStart + span + 0.5) leavesSpan = true
      const next = horizontal
        ? { ...placement, x: Math.round(cursor) }
        : { ...placement, y: Math.round(cursor) }
      cursor += size + gap
      return { ...entry, next }
    })
    // Distributing spaces the members *between* the outermost two. When they do
    // not fit between them the gap goes negative far enough to walk the cursor
    // backwards, and a member lands outside the pair that was meant to bound it
    // — off the display, from a layout that was entirely on it, leaving a
    // document the device will not take. There is no even spacing to be had
    // here, so nothing moves.
    if (leavesSpan) return
    applyPlacements(configuration, targets)
  })
}

/**
 * The selection in display coordinates, whatever parents the widgets sit in.
 * Aligning a widget in a container against one on the screen has to compare boxes
 * in one space; `offset` is what each result subtracts on the way back.
 */
interface Placed {
  widget: WidgetConfiguration
  id: string
  placement: Required<WidgetPlacement>
  /** How many containers it sits inside, which is the order it must be written in. */
  depth: number
}

function selectedPlacements(
  configuration: DeviceConfiguration,
  ids: readonly string[]
): Placed[] {
  const placed: Placed[] = []
  for (const id of ids) {
    const location = findWidget(configuration, id)
    const placement = absolutePlacement(configuration, id)
    if (location && placement) {
      placed.push({
        widget: location.widget,
        id,
        placement,
        depth: ancestorsOf(configuration, location).length
      })
    }
  }
  return placed
}

/**
 * Writes the resolved boxes back, outermost first.
 *
 * A selection may hold a container *and* something inside it, and moving the
 * container carries its children with it — so a child's parent origin is only
 * settled once the container itself has been written. Reading each offset at
 * the moment it is used, in that order, is what keeps a shape aligned together
 * with one of its own widgets from displacing the child by however far its
 * container travelled: with the offset read up front the child moved twice, far
 * enough to leave the display from a layout that was entirely on it.
 */
function applyPlacements(
  configuration: DeviceConfiguration,
  targets: (Placed & { next: Required<WidgetPlacement> })[]
): void {
  for (const { widget, id, next } of [...targets].sort((one, two) => one.depth - two.depth)) {
    writePlacement(widget, next, parentOffset(configuration, id))
  }
}
