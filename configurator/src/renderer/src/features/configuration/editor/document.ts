import { screensOf, type WidgetParent } from '@shared/configuration-access'
import { type ScreenConfiguration, type SlotPageConfiguration, type WidgetConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { type WidgetSelection, useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

export interface WidgetLocation {
  screenIndex: number
  /**
   * Index chain from the screen's own widget array down to this widget: one
   * entry for a widget on the screen, one more for every container it sits
   * inside — and, directly after a slot, one for the page, because a slot holds
   * its widgets a level down. A container is a widget, so depth is a path rather
   * than a flag, and the widget type at each step says how the next entry reads.
   */
  path: number[]
  widget: WidgetConfiguration
}

export function activeScreen(
  configuration: DeviceConfiguration | undefined
): ScreenConfiguration | undefined {
  return screensOf(configuration)[useDashboardEditorStore.getState().activeScreenIndex]
}

/**
 * The owners between a screen and the widget a path names, and the containers
 * entered on the way. Walks the raw arrays rather than the filtered read
 * helpers, because a path index has to mean the same thing to a write as to the
 * search that produced it.
 */
function walkPath(
  screen: ScreenConfiguration,
  path: readonly number[]
): { owner: WidgetParent; containers: WidgetConfiguration[] } | undefined {
  const containers: WidgetConfiguration[] = []
  let owner: WidgetParent = screen
  let step = 0
  // Every entry but the last names a container to descend into; the last names
  // the widget itself, which is the caller's business.
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

/** Every container between a widget and its screen, outermost first. */
export function ancestorsOf(
  configuration: DeviceConfiguration | undefined,
  location: WidgetLocation
): WidgetConfiguration[] {
  const screen = screensOf(configuration)[location.screenIndex]
  return screen ? walkPath(screen, location.path)?.containers ?? [] : []
}

/**
 * The parent a widget is authored in: its screen, the container above it, or the
 * slot page it sits on. This is the live record inside `configuration`, so an
 * edit may write through it — which is what makes it the one walk every
 * structural edit shares.
 */
export function parentOf(
  configuration: DeviceConfiguration,
  location: WidgetLocation
): WidgetParent | undefined {
  const screen = configuration.dashboard?.screens?.[location.screenIndex]
  return screen ? walkPath(screen, location.path)?.owner : undefined
}

/** The array a widget lives in, which is what an edit has to splice. */
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

/**
 * Which widget a click actually picks, given what it landed on.
 *
 * A child is drawn above its parent, so the object under the pointer is always
 * the deepest one — which used to be the selection, leaving a full container
 * grabbable only at its edges. The rule here is the one Figma and Sketch both
 * use: a click picks the outermost container, and going deeper is asked for,
 * either by holding the modifier (`deep`) or by having opened a container
 * (`entered`), in which case the level *inside* it is what a click reaches.
 *
 * `blocked` is the editor's own veto — a locked layer — and it is applied per
 * level rather than to the answer, so a locked container still lets a click
 * through to what it holds instead of swallowing it. Undefined means every
 * candidate was blocked, which is a click that should reach the canvas behind.
 */
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

export {
  absolutePlacement,
  absolutePlacements,
  completePlacement,
  parentOffset,
  writePlacement
} from './document-geometry'
