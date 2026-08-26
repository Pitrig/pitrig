import { createWidgetId, widgetsOf } from '@shared/configuration-access'
import { MAXIMUM_WIDGETS_PER_CONTAINER, type WidgetConfiguration } from '@shared/configuration-schema'
import type { WidgetPlacement } from '@shared/configuration-schema'
import { type WidgetLocation, completePlacement, findWidget, mutateDraftConfiguration, widgetArrayOf } from './document'
import { useDeviceStore } from '@/features/device/device-store'

export function wrapInShape(ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined
  const configuration = useDeviceStore.getState().draft
  if (!configuration) return undefined
  const locations = ids
    .map((id) => findWidget(configuration, id))
    .filter((location): location is WidgetLocation => location !== undefined)
  if (locations.length !== ids.length) return undefined
  const first = locations[0]!
  const parentPath = first.path.slice(0, -1).join('/')
  if (
    locations.some(
      (location) =>
        location.screenIndex !== first.screenIndex ||
        location.path.slice(0, -1).join('/') !== parentPath
    )
  ) {
    return undefined
  }
  if (locations.some(({ widget }) => widget.type === 'slot')) return undefined
  const boxes = locations.map(({ widget }) => completePlacement(widget.placement))
  if (boxes.some((box) => box === undefined)) return undefined
  const placed = boxes as Required<WidgetPlacement>[]
  const left = Math.min(...placed.map((box) => box.x))
  const top = Math.min(...placed.map((box) => box.y))
  const right = Math.max(...placed.map((box) => box.x + box.width))
  const bottom = Math.max(...placed.map((box) => box.y + box.height))
  if (right <= left || bottom <= top) return undefined

  const id = createWidgetId()
  let created: string | undefined
  mutateDraftConfiguration((next) => {
    const siblings = widgetArrayOf(next, first)
    if (!siblings) return
    if (siblings.length > MAXIMUM_WIDGETS_PER_CONTAINER) return
    const members: WidgetConfiguration[] = []
    let insertion = siblings.length
    for (const memberId of ids) {
      const index = siblings.findIndex((widget) => widget.id === memberId)
      const widget = siblings[index]
      if (index < 0 || !widget) continue
      insertion = Math.min(insertion, index)
      siblings.splice(index, 1)
      const box = completePlacement(widget.placement)
      if (!box) continue
      members.push({
        ...widget,
        placement: { ...box, x: box.x - left, y: box.y - top }
      })
    }
    if (members.length === 0) return
    siblings.splice(insertion, 0, {
      type: 'shape',
      kind: 'rectangle',
      id,
      clip_children: false,
      placement: { x: left, y: top, width: right - left, height: bottom - top },
      widgets: members
    })
    created = id
  })
  return created
}

export function unwrapShape(id: string): string[] {
  const released: string[] = []
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, id)
    if (!location || location.widget.type !== 'shape') return
    const siblings = widgetArrayOf(configuration, location)
    const index = location.path[location.path.length - 1]
    if (!siblings || index === undefined) return
    const container = siblings[index]
    if (container?.type !== 'shape') return
    const box = completePlacement(container.placement)
    if (!box) return
    const members = widgetsOf(container).map((member) => {
      const memberBox = completePlacement(member.placement)
      if (member.id) released.push(member.id)
      return {
        ...member,
        ...(memberBox
          ? { placement: { ...memberBox, x: memberBox.x + box.x, y: memberBox.y + box.y } }
          : {})
      }
    })
    siblings.splice(index, 1, ...members)
  })
  return released
}
