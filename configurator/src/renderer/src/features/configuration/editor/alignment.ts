import { type DeviceConfiguration } from '@shared/device'
import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { absolutePlacement, findWidget, mutateDraftConfiguration, parentOffset, writePlacement } from './document'

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
    for (const { widget, placement, offset } of placed) {
      const next = { ...placement }
      if (edge === 'left') next.x = left
      else if (edge === 'right') next.x = right - placement.width
      else if (edge === 'center') next.x = Math.round((left + right - placement.width) / 2)
      else if (edge === 'top') next.y = top
      else if (edge === 'bottom') next.y = bottom - placement.height
      else next.y = Math.round((top + bottom - placement.height) / 2)
      writePlacement(widget, next, offset)
    }
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
    let cursor = horizontal ? first.x : first.y
    for (const { widget, placement, offset } of ordered) {
      writePlacement(
        widget,
        horizontal
          ? { ...placement, x: Math.round(cursor) }
          : { ...placement, y: Math.round(cursor) },
        offset
      )
      cursor += (horizontal ? placement.width : placement.height) + gap
    }
  })
}

/**
 * The selection in display coordinates, whatever parents the widgets sit in.
 * Aligning a widget in a container against one on the screen has to compare boxes
 * in one space; `offset` is what each result subtracts on the way back.
 */
function selectedPlacements(
  configuration: DeviceConfiguration,
  ids: readonly string[]
): {
  widget: WidgetConfiguration
  placement: Required<WidgetPlacement>
  offset: { x: number; y: number }
}[] {
  const placed: {
    widget: WidgetConfiguration
    placement: Required<WidgetPlacement>
    offset: { x: number; y: number }
  }[] = []
  for (const id of ids) {
    const widget = findWidget(configuration, id)?.widget
    const placement = absolutePlacement(configuration, id)
    if (widget && placement) {
      placed.push({ widget, placement, offset: parentOffset(configuration, id) })
    }
  }
  return placed
}
