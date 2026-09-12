import { stackOrder } from '@shared/configuration-access'
import type { WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'

import { findWidget, mutateDraftConfiguration, parentOf } from './document'

export type StackMove = 'front' | 'forward' | 'backward' | 'back'

export function stackRankOf(
  configuration: DeviceConfiguration | undefined,
  id: string
): number {
  if (!configuration) return 0
  const location = findWidget(configuration, id)
  if (!location) return 0
  const siblings = parentOf(configuration, location)?.widgets
  const rank = stackOrder(siblings).findIndex(({ widget }) => widget === location.widget)
  return rank < 0 ? location.widget.z_index ?? 0 : rank
}

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

export function restackWidget(id: string, move: StackMove): boolean {
  let moved = false
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, id)
    if (!location) return false
    const owner = parentOf(configuration, location)
    const siblings = owner?.widgets
    if (!owner || !siblings) return false
    const order = stackOrder(siblings).map(({ widget }) => widget)
    const at = order.indexOf(location.widget)
    if (at < 0) return false
    const to =
      move === 'front'
        ? order.length - 1
        : move === 'back'
          ? 0
          : Math.min(Math.max(at + (move === 'forward' ? 1 : -1), 0), order.length - 1)
    if (to === at) return false
    const [widget] = order.splice(at, 1) as [WidgetConfiguration]
    order.splice(to, 0, widget)
    siblings.splice(0, siblings.length, ...order)
    order.forEach((entry, index) => {
      entry.z_index = index
    })
    moved = true
    return true
  })
  return moved
}
