import { screensOf, type WidgetParent } from '@shared/configuration-access'
import { type ScreenConfiguration, type SlotPageConfiguration, type WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { type WidgetSelection, useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

export interface WidgetLocation {
  screenIndex: number
  path: number[]
  widget: WidgetConfiguration
}

export function activeScreen(
  configuration: DeviceConfiguration | undefined
): ScreenConfiguration | undefined {
  return screensOf(configuration)[useDashboardEditorStore.getState().activeScreenIndex]
}

function walkPath(
  screen: ScreenConfiguration,
  path: readonly number[]
): { owner: WidgetParent; containers: WidgetConfiguration[] } | undefined {
  const containers: WidgetConfiguration[] = []
  let owner: WidgetParent = screen
  let step = 0
  while (step < path.length - 1) {
    const widget: WidgetConfiguration | undefined = owner.widgets?.[path[step] as number]
    step += 1
    if (widget?.type === 'shape') {
      owner = widget
    } else if (widget?.type === 'slot') {
      const page: SlotPageConfiguration | undefined = widget.pages?.[path[step] as number]
      if (!page) return undefined
      step += 1
      owner = page
    } else {
      return undefined
    }
    containers.push(widget)
  }
  return { owner, containers }
}

export function findWidget(
  configuration: DeviceConfiguration | undefined,
  id: string
): WidgetLocation | undefined {
  const screens = screensOf(configuration)
  const search = (
    parent: WidgetParent,
    screenIndex: number,
    prefix: number[]
  ): WidgetLocation | undefined => {
    const widgets = parent.widgets ?? []
    for (let index = 0; index < widgets.length; ++index) {
      const widget: WidgetConfiguration | undefined = widgets[index]
      if (!widget) continue
      const path = [...prefix, index]
      if (widget.id === id) return { screenIndex, path, widget }
      if (widget.type === 'shape') {
        const nested = search(widget, screenIndex, path)
        if (nested) return nested
      } else if (widget.type === 'slot') {
        const pages = widget.pages ?? []
        for (let page = 0; page < pages.length; ++page) {
          const inside = pages[page]
          if (!inside) continue
          const nested = search(inside, screenIndex, [...path, page])
          if (nested) return nested
        }
      }
    }
    return undefined
  }
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const screen = screens[screenIndex]
    if (!screen) continue
    const found = search(screen, screenIndex, [])
    if (found) return found
  }
  return undefined
}

export function ancestorsOf(
  configuration: DeviceConfiguration | undefined,
  location: WidgetLocation
): WidgetConfiguration[] {
  const screen = screensOf(configuration)[location.screenIndex]
  return screen ? walkPath(screen, location.path)?.containers ?? [] : []
}

export function parentOf(
  configuration: DeviceConfiguration,
  location: WidgetLocation
): WidgetParent | undefined {
  const screen = configuration.dashboard?.screens?.[location.screenIndex]
  return screen ? walkPath(screen, location.path)?.owner : undefined
}

export function widgetArrayOf(
  configuration: DeviceConfiguration,
  location: WidgetLocation
): WidgetConfiguration[] | undefined {
  return parentOf(configuration, location)?.widgets
}

export function parentContainerId(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): string | undefined {
  if (selection?.type !== 'widget') return undefined
  const location = findWidget(configuration, selection.id)
  if (!location) return undefined
  return ancestorsOf(configuration, location).at(-1)?.id
}

export function selectionTarget(
  configuration: DeviceConfiguration | undefined,
  hitId: string,
  options: {
    entered?: string
    deep?: boolean
    blocked?: (id: string) => boolean
  } = {}
): string | undefined {
  const location = findWidget(configuration, hitId)
  if (!location) return undefined
  const chain = [...ancestorsOf(configuration, location), location.widget]
    .map((widget) => widget.id)
    .filter((id): id is string => id !== undefined)
  const entered = options.entered === undefined ? -1 : chain.indexOf(options.entered)
  const from = options.deep ? chain.length - 1 : entered + 1
  for (let index = Math.max(from, 0); index < chain.length; ++index) {
    const candidate = chain[index] as string
    if (!options.blocked?.(candidate)) return candidate
  }
  return undefined
}

export function selectedWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): WidgetConfiguration | undefined {
  if (selection?.type !== 'widget') return undefined
  return findWidget(configuration, selection.id)?.widget
}

export function mutateDraftConfiguration(
  mutation: (configuration: DeviceConfiguration) => boolean | void
): boolean {
  const store = useDeviceStore.getState()
  if (!store.draft) return false
  const next = structuredClone(store.draft)
  if (mutation(next) === false) return false
  store.setDraft(next)
  return true
}

export function mutateSelectedWidget(
  selection: WidgetSelection,
  mutation: (widget: WidgetConfiguration, configuration: DeviceConfiguration) => void
): void {
  if (selection.type !== 'widget') return
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (!location) return false
    mutation(location.widget, configuration)
    return true
  })
}

export {
  absolutePlacement,
  absolutePlacements,
  completePlacement,
  parentOffset,
  writePlacement
} from './document-geometry'
