import { useDeviceStore } from '@/features/device/device-store'
import { stackRankOf, type DropRelation } from '../dashboard-editor'

export type Dragged = string[]

export interface DropTarget {
  id: string
  band: DropRelation
  page?: number
}

export interface RowState {
  dragged?: Dragged
  setDragged: (dragged?: Dragged) => void
  renaming?: string
  setRenaming: (id?: string) => void
  dropTarget?: DropTarget
  setDropTarget: (target?: DropTarget) => void
  openMenu: (event: React.MouseEvent, id: string) => void
}

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
