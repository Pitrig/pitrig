import { WIDGET_POOL_CAPACITIES, allWidgetsOf, createWidgetId, stackOrder, subtreeHeight, widgetsOf } from '@shared/configuration-access'
import { MAXIMUM_NESTING_DEPTH, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration } from '@shared/configuration-schema'
import type { WidgetPlacement } from '@shared/configuration-schema'
import { type WidgetLocation, ancestorsOf, completePlacement, findWidget, mutateDraftConfiguration, widgetArrayOf } from './document'
import { useDeviceStore } from '@/features/device/device-store'

export function wrapInShape(ids: readonly string[]): string | undefined {
  if (ids.length === 0 || ids.length > MAXIMUM_WIDGETS_PER_CONTAINER) return undefined
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
  const shapes = allWidgetsOf(configuration).filter(({ type }) => type === 'shape').length
  if (shapes >= WIDGET_POOL_CAPACITIES.shape) return undefined
  const depth = ancestorsOf(configuration, first).length
  const height = 1 + Math.max(...locations.map(({ widget }) => subtreeHeight(widget)))
  if (depth + height >= MAXIMUM_NESTING_DEPTH) return undefined
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
    if (!siblings) return false
    const chosen = new Set(ids)
    const member = (widget: WidgetConfiguration): boolean =>
      widget.id !== undefined && chosen.has(widget.id)
    const order = stackOrder(siblings).map(({ widget }) => widget)
    const taken = order.filter(member)
    if (taken.length !== ids.length) return false
    let topmost = -1
    order.forEach((widget, index) => {
      if (member(widget)) topmost = index
    })
    const rest = order.filter((widget) => !member(widget))
    const at = order.slice(0, topmost).filter((widget) => !member(widget)).length
    const container: WidgetConfiguration = {
      type: 'shape',
      kind: 'rectangle',
      id,
      clip_children: false,
      placement: { x: left, y: top, width: right - left, height: bottom - top },
      widgets: taken.map((widget) => {
        const box = completePlacement(widget.placement)
        return box ? { ...widget, placement: { ...box, x: box.x - left, y: box.y - top } } : widget
      })
    }
    const stacked = [...rest.slice(0, at), container, ...rest.slice(at)]
    siblings.splice(0, siblings.length, ...stacked)
    stacked.forEach((widget, index) => {
      widget.z_index = index
    })
    created = id
    return true
  })
  return created
}

export function unwrapShape(id: string): string[] {
  const released: string[] = []
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, id)
    if (!location || location.widget.type !== 'shape') return false
    const siblings = widgetArrayOf(configuration, location)
    const index = location.path[location.path.length - 1]
    if (!siblings || index === undefined) return false
    const container = siblings[index]
    if (container?.type !== 'shape') return false
    const box = completePlacement(container.placement)
    if (!box) return false
    const children = stackOrder(widgetsOf(container)).map(({ widget }) => widget)
    if (children.length === 0) return false
    const depth = ancestorsOf(configuration, location).length
    const capacity = depth === 0 ? MAXIMUM_WIDGETS_PER_SCREEN : MAXIMUM_WIDGETS_PER_CONTAINER
    if (siblings.length - 1 + children.length > capacity) return false
    const members = children.map((member) => {
      const memberBox = completePlacement(member.placement)
      if (member.id) released.push(member.id)
      return memberBox
        ? { ...member, placement: { ...memberBox, x: memberBox.x + box.x, y: memberBox.y + box.y } }
        : member
    })
    const order = stackOrder(siblings).map(({ widget }) => widget)
    const at = order.indexOf(container)
    const stacked = [...order.slice(0, at), ...members, ...order.slice(at + 1)]
    siblings.splice(0, siblings.length, ...stacked)
    stacked.forEach((widget, position) => {
      widget.z_index = position
    })
    return true
  })
  return released
}
