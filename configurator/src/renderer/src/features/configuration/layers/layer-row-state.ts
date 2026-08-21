import { useDeviceStore } from '@/features/device/device-store'
import { stackRankOf, type DropRelation } from '../dashboard-editor'

/** What is being dragged: one row, or the whole selection when the row is in it. */
export type Dragged = string[]

export interface DropTarget {
  id: string
  band: DropRelation
  /** Set when the row is a slot page rather than a widget. */
  page?: number
}

export interface RowState {
  dragged?: Dragged
  setDragged: (dragged?: Dragged) => void
  renaming?: string
  setRenaming: (id?: string) => void
  dropTarget?: DropTarget
  setDropTarget: (target?: DropTarget) => void
  /** Where the right button was pressed, and on which row. */
  openMenu: (event: React.MouseEvent, id: string) => void
}

/**
 * The order a dragged group has to be applied in to land arranged as it was.
 * Each move puts its widget directly at the anchor, so whichever is applied
 * last ends up nearest it: above a row that is the bottom of the group, and
 * below it or inside a container that is the top.
 */
export function dropOrder(
  draft: ReturnType<typeof useDeviceStore.getState>['draft'],
  ids: readonly string[],
  band: DropRelation
): string[] {
  const ascending = [...ids].sort(
    (left, right) => stackRankOf(draft, left) - stackRankOf(draft, right)
  )
  return band === 'above' ? ascending.reverse() : ascending
}
