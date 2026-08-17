import { createWidgetId, widgetsOf } from '../../../../../shared/configuration-access'
import { MAXIMUM_GROUPS, type WidgetConfiguration, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { type WidgetLocation, absolutePlacement, completePlacement, findGroup, findWidget, mutateDraftConfiguration, parentOffset } from './document'
import { useDeviceStore } from '@/features/device/device-store'

export function groupWidgets(ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined
  const configuration = useDeviceStore.getState().draft
  if (!configuration) return undefined
  const locations = ids
    .map((id) => findWidget(configuration, id))
    .filter((location): location is WidgetLocation => location !== undefined)
  if (locations.length !== ids.length) return undefined
  const screenIndex = locations[0]!.screenIndex
  if (
    locations.some(
      (location) => location.screenIndex !== screenIndex || location.groupIndex !== undefined
    )
  ) {
    return undefined
  }
  // A widget with no usable box has nothing to contribute to the group's
  // bounds, so grouping is refused rather than guessed at.
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
    const screen = next.dashboard?.screens?.[screenIndex]
    if (!screen?.widgets) return
    const groups = (screen.groups ??= [])
    if (groups.length >= MAXIMUM_GROUPS) return
    const members: WidgetConfiguration[] = []
    for (const memberId of ids) {
      const index = screen.widgets.findIndex((widget) => widget.id === memberId)
      const widget = screen.widgets[index]
      if (index < 0 || !widget) continue
      screen.widgets.splice(index, 1)
      const box = completePlacement(widget.placement)
      if (!box) continue
      members.push({
        ...widget,
        placement: { ...box, x: box.x - left, y: box.y - top }
      })
    }
    if (members.length === 0) return
    if (screen.widgets.length === 0) delete screen.widgets
    groups.push({
      id,
      placement: { x: left, y: top, width: right - left, height: bottom - top },
      widgets: members
    })
    created = id
  })
  return created
}

/** Puts a group's widgets back on its screen with absolute geometry. */
export function ungroupWidgets(id: string): string[] {
  const released: string[] = []
  mutateDraftConfiguration((configuration) => {
    const location = findGroup(configuration, id)
    if (!location) return
    const screen = configuration.dashboard?.screens?.[location.screenIndex]
    const groups = screen?.groups
    if (!screen || !groups) return
    const box = completePlacement(location.group.placement)
    if (!box) return
    const widgets = (screen.widgets ??= [])
    for (const member of widgetsOf(groups[location.groupIndex])) {
      const memberBox = completePlacement(member.placement)
      widgets.push({
        ...member,
        ...(memberBox
          ? { placement: { ...memberBox, x: memberBox.x + box.x, y: memberBox.y + box.y } }
          : {})
      })
      if (member.id) released.push(member.id)
    }
    groups.splice(location.groupIndex, 1)
    if (groups.length === 0) delete screen.groups
  })
  return released
}

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
 * Aligning a widget in a group against one on the screen has to compare boxes
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

/** Writes a display-space box back into the widget's own coordinate space. */
function writePlacement(
  widget: WidgetConfiguration,
  placement: Required<WidgetPlacement>,
  offset: { x: number; y: number }
): void {
  widget.placement = { ...placement, x: placement.x - offset.x, y: placement.y - offset.y }
}

/**
 * Rewrites `z_index` so the widgets stack in the given order, back to front.
 * Writing every index rather than only the moved one keeps the stack readable
 * in the JSON editor and leaves no ties for the authored order to break.
 */
export function reorderWidgets(orderedIds: readonly string[]): void {
  mutateDraftConfiguration((configuration) => {
    orderedIds.forEach((id, index) => {
      const widget = findWidget(configuration, id)?.widget
      if (widget) widget.z_index = index
    })
  })
}

/**
 * Renames a widget. The id is the widget's name in the document — it is never
 * drawn, unlike the caption — so the layer list edits it directly. A duplicate
 * or an oversized name is refused rather than silently adjusted, because the
 * device stores 15 bytes and rejects a document with a longer one.
 */
