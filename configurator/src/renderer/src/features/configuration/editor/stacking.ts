import { stackOrder } from '@shared/configuration-access'
import type { WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'

import { findWidget, mutateDraftConfiguration, parentOf } from './document'

// Where a widget sits in its own parent's stack. Restacking is a document edit
// like any other — `z_index` is what the device draws by — and it happens
// inside one parent, because a widget inside a container cannot be raised above
// something outside it without raising the container (ADR 0021).

/** How far a widget moves through its siblings, back to front. */
export type StackMove = 'front' | 'forward' | 'backward' | 'back'

/**
 * Where a widget currently sits in its parent's stack, which is what orders a
 * selection before it is restacked as a group. `z_index` is that rank: every
 * command that reorders a parent rewrites all of them from the array, so it is
 * never stale and never tied.
 */
export function stackRankOf(
  configuration: DeviceConfiguration | undefined,
  id: string
): number {
  return findWidget(configuration, id)?.widget.z_index ?? 0
}

/**
 * The order a group has to be restacked in to come out arranged as it went in.
 * Each move lands its widget at one end of the parent, so whichever is applied
 * last ends up outermost — which means the widget that should finish outermost
 * has to go last.
 */
export function restackOrder(
  configuration: DeviceConfiguration | undefined,
  ids: readonly string[],
  move: StackMove
): string[] {
  const ascending = [...ids].sort(
    (left, right) => stackRankOf(configuration, left) - stackRankOf(configuration, right)
  )
  return move === 'front' || move === 'backward' ? ascending : ascending.reverse()
}

/**
 * Moves one widget through its siblings and rewrites every `z_index` in that
 * parent, exactly as a drop in the layer panel does. Writing all of them rather
 * than only the moved one leaves no ties for the authored order to break and
 * keeps array order and `z_index` agreeing, which every later move relies on.
 */
export function restackWidget(id: string, move: StackMove): boolean {
  let moved = false
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, id)
    if (!location) return
    const owner = parentOf(configuration, location)
    const siblings = owner?.widgets
    if (!owner || !siblings) return
    // Back to front, which is what z_index means and what "forward" moves along.
    const order = stackOrder(siblings).map(({ widget }) => widget)
    const at = order.indexOf(location.widget)
    if (at < 0) return
    const to =
      move === 'front'
        ? order.length - 1
        : move === 'back'
          ? 0
          : Math.min(Math.max(at + (move === 'forward' ? 1 : -1), 0), order.length - 1)
    if (to === at) return
    const [widget] = order.splice(at, 1) as [WidgetConfiguration]
    order.splice(to, 0, widget)
    siblings.splice(0, siblings.length, ...order)
    order.forEach((entry, index) => {
      entry.z_index = index
    })
    moved = true
  })
  return moved
}
