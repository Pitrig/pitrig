import { screensOf, type WidgetParent } from '@shared/configuration-access'
import type { WidgetConfiguration, WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { ancestorsOf, findWidget } from './document'

export function parentOffset(
  configuration: DeviceConfiguration | undefined,
  id: string
): { x: number; y: number } {
  const location = findWidget(configuration, id)
  if (!configuration || !location) return { x: 0, y: 0 }
  return ancestorsOf(configuration, location).reduce(
    (offset, ancestor) => {
      const box = completePlacement(ancestor.placement)
      return box ? { x: offset.x + box.x, y: offset.y + box.y } : offset
    },
    { x: 0, y: 0 }
  )
}

export function absolutePlacement(
  configuration: DeviceConfiguration | undefined,
  id: string
): Required<WidgetPlacement> | undefined {
  const box = completePlacement(findWidget(configuration, id)?.widget.placement)
  if (!box) return undefined
  const offset = parentOffset(configuration, id)
  return { ...box, x: box.x + offset.x, y: box.y + offset.y }
}

export function absolutePlacements(
  configuration: DeviceConfiguration | undefined
): Map<string, Required<WidgetPlacement>> {
  const placements = new Map<string, Required<WidgetPlacement>>()
  const visit = (parent: WidgetParent, offset: { x: number; y: number }): void => {
    for (const widget of parent.widgets ?? []) {
      if (!widget) continue
      const box = completePlacement(widget.placement)
      if (box && widget.id !== undefined && !placements.has(widget.id)) {
        placements.set(widget.id, { ...box, x: box.x + offset.x, y: box.y + offset.y })
      }
      if (widget.type !== 'shape' && widget.type !== 'slot') continue
      const inside = box ? { x: offset.x + box.x, y: offset.y + box.y } : offset
      if (widget.type === 'shape') {
        visit(widget, inside)
        continue
      }
      for (const page of widget.pages ?? []) {
        if (page) visit(page, inside)
      }
    }
  }
  for (const screen of screensOf(configuration)) {
    if (screen) visit(screen, { x: 0, y: 0 })
  }
  return placements
}

export function completePlacement(
  placement: WidgetPlacement | undefined
): Required<WidgetPlacement> | undefined {
  if (
    !placement ||
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.width) ||
    !Number.isFinite(placement.height) ||
    (placement.width ?? 0) <= 0 ||
    (placement.height ?? 0) <= 0
  ) {
    return undefined
  }
  return placement as Required<WidgetPlacement>
}

export function writePlacement(
  widget: WidgetConfiguration,
  placement: Required<WidgetPlacement>,
  offset: { x: number; y: number }
): void {
  widget.placement = { ...placement, x: placement.x - offset.x, y: placement.y - offset.y }
}
