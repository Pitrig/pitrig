import { type DeviceConfiguration } from '@shared/device'
import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { absolutePlacement, ancestorsOf, findWidget, mutateDraftConfiguration, parentOffset, writePlacement } from './document'

export type AlignmentEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributionAxis = 'horizontal' | 'vertical'

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
      if (cursor < spanStart - 0.5 || cursor + size > spanStart + span + 0.5) leavesSpan = true
      const next = horizontal
        ? { ...placement, x: Math.round(cursor) }
        : { ...placement, y: Math.round(cursor) }
      cursor += size + gap
      return { ...entry, next }
    })
    if (leavesSpan) return
    applyPlacements(configuration, targets)
  })
}

interface Placed {
  widget: WidgetConfiguration
  id: string
  placement: Required<WidgetPlacement>
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

function applyPlacements(
  configuration: DeviceConfiguration,
  targets: (Placed & { next: Required<WidgetPlacement> })[]
): void {
  for (const { widget, id, next } of [...targets].sort((one, two) => one.depth - two.depth)) {
    writePlacement(widget, next, parentOffset(configuration, id))
  }
}
