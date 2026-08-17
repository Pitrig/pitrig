import { groupsOf, screensOf, widgetsOf } from '../../../../../shared/configuration-access'
import { type GroupConfiguration, type ScreenConfiguration, type WidgetConfiguration, type WidgetPlacement } from '../../../../../shared/configuration-schema'
import { type DeviceConfiguration } from '../../../../../shared/device'
import { type WidgetSelection, useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

export interface WidgetLocation {
  screenIndex: number
  /** Absent for a widget authored directly on the screen. */
  groupIndex?: number
  widgetIndex: number
  widget: WidgetConfiguration
}

export interface GroupLocation {
  screenIndex: number
  groupIndex: number
  group: GroupConfiguration
}

export function activeScreen(
  configuration: DeviceConfiguration | undefined
): ScreenConfiguration | undefined {
  return screensOf(configuration)[useDashboardEditorStore.getState().activeScreenIndex]
}

export function findWidget(
  configuration: DeviceConfiguration | undefined,
  id: string
): WidgetLocation | undefined {
  const screens = screensOf(configuration)
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const screen = screens[screenIndex]
    const widgets = widgetsOf(screen)
    const widgetIndex = widgets.findIndex((widget) => widget.id === id)
    const widget = widgets[widgetIndex]
    if (widgetIndex >= 0 && widget) {
      return { screenIndex, widgetIndex, widget }
    }
    const groups = groupsOf(screen)
    for (let groupIndex = 0; groupIndex < groups.length; ++groupIndex) {
      const members = widgetsOf(groups[groupIndex])
      const memberIndex = members.findIndex((member) => member.id === id)
      const member = members[memberIndex]
      if (memberIndex >= 0 && member) {
        return { screenIndex, groupIndex, widgetIndex: memberIndex, widget: member }
      }
    }
  }
  return undefined
}

export function findGroup(
  configuration: DeviceConfiguration | undefined,
  id: string
): GroupLocation | undefined {
  const screens = screensOf(configuration)
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const groups = groupsOf(screens[screenIndex])
    const groupIndex = groups.findIndex((group) => group.id === id)
    const group = groups[groupIndex]
    if (groupIndex >= 0 && group) {
      return { screenIndex, groupIndex, group }
    }
  }
  return undefined
}

/** The array a widget lives in, which is what an edit has to splice. */
export function widgetArrayOf(
  configuration: DeviceConfiguration,
  location: WidgetLocation
): WidgetConfiguration[] | undefined {
  const screen = configuration.dashboard?.screens?.[location.screenIndex]
  if (!screen) return undefined
  return location.groupIndex === undefined
    ? screen.widgets
    : screen.groups?.[location.groupIndex]?.widgets
}

/**
 * Where a widget's parent sits on the display. Geometry inside a group is
 * relative to the group's box, so the canvas — which works entirely in display
 * coordinates — adds this on the way out and subtracts it on the way in.
 */
export function parentOffset(
  configuration: DeviceConfiguration | undefined,
  id: string
): { x: number; y: number } {
  const location = findWidget(configuration, id)
  if (!configuration || !location || location.groupIndex === undefined) return { x: 0, y: 0 }
  const group = screensOf(configuration)[location.screenIndex]?.groups?.[location.groupIndex]
  const box = completePlacement(group?.placement)
  return box ? { x: box.x, y: box.y } : { x: 0, y: 0 }
}

/** A widget's box in display coordinates, whatever parent it was authored in. */
export function absolutePlacement(
  configuration: DeviceConfiguration | undefined,
  id: string
): Required<WidgetPlacement> | undefined {
  const box = completePlacement(findWidget(configuration, id)?.widget.placement)
  if (!box) return undefined
  const offset = parentOffset(configuration, id)
  return { ...box, x: box.x + offset.x, y: box.y + offset.y }
}

export function selectedWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): WidgetConfiguration | undefined {
  if (selection?.type !== 'widget') return undefined
  return findWidget(configuration, selection.id)?.widget
}

/**
 * The single funnel for every structured edit. The mutation runs against a
 * clone so the store always receives a new document, which keeps React updates
 * and any future history snapshot honest.
 */
export function mutateDraftConfiguration(
  mutation: (configuration: DeviceConfiguration) => void
): void {
  const store = useDeviceStore.getState()
  if (!store.draft) return
  const next = structuredClone(store.draft)
  mutation(next)
  store.setDraft(next)
}

export function mutateSelectedWidget(
  selection: WidgetSelection,
  mutation: (widget: WidgetConfiguration, configuration: DeviceConfiguration) => void
): void {
  if (selection.type !== 'widget') return
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (location) mutation(location.widget, configuration)
  })
}

/**
 * Edits the group that owns a widget. The inspector reaches a group through the
 * selection rather than through a selection type of its own: a group is a
 * parent, and what the author is looking at is always one of its widgets.
 */
export function mutateGroup(
  id: string,
  mutation: (group: GroupConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const location = findGroup(configuration, id)
    if (!location) return
    const group = configuration.dashboard?.screens?.[location.screenIndex]?.groups?.[
      location.groupIndex
    ]
    if (group) mutation(group)
  })
}

/**
 * The group a selection refers to: the group itself when one is selected, and
 * the owning group when a widget inside one is. One inspector serves both.
 */
export function selectedGroupId(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): string | undefined {
  if (!selection || selection.type === 'screen') return undefined
  if (selection.type === 'group') return selection.id
  const location = findWidget(configuration, selection.id)
  if (!location || location.groupIndex === undefined) return undefined
  return screensOf(configuration)[location.screenIndex]?.groups?.[location.groupIndex]?.id
}

export function groupById(
  configuration: DeviceConfiguration | undefined,
  id: string | undefined
): GroupConfiguration | undefined {
  return id ? findGroup(configuration, id)?.group : undefined
}

/** Removes a group and everything in it. */
export function deleteGroup(id: string): boolean {
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const location = findGroup(configuration, id)
    const groups = configuration.dashboard?.screens?.[location?.screenIndex ?? -1]?.groups
    if (!location || !groups) return
    groups.splice(location.groupIndex, 1)
    if (groups.length === 0) {
      delete configuration.dashboard!.screens![location.screenIndex]!.groups
    }
    deleted = true
  })
  return deleted
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
