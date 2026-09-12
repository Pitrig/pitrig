import { allWidgetsOf, freshWidgetIds, isContainer, pagesOf, subtreeHeight } from '@shared/configuration-access'
import { MAXIMUM_NESTING_DEPTH, MAXIMUM_WIDGETS_PER_CONTAINER, MAXIMUM_WIDGETS_PER_SCREEN, type WidgetConfiguration, type WidgetPlacement } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { applyFontFamily } from '@shared/document-fonts'
import { type WidgetLocation, absolutePlacement, ancestorsOf, completePlacement, findWidget, mutateDraftConfiguration, parentOf, widgetArrayOf } from './document'
import { insertionRefusal } from './capacity'
import { visibleSlotPage } from '../preview/canvas-geometry'
import { ensureScreen } from './screens'
import { useDashboardEditorStore, type WidgetSelection } from './store'
import {
  WIDGET_DEFAULTS,
  centeredPlacement,
  type NewWidgetExtras
} from './widget-defaults'

export {
  DEFAULT_CAPTION_FONT_SIZE_PX,
  DEFAULT_WIDGET_FONT_SIZE_PX,
  NEW_GRAPH_BINDING,
  NEW_WIDGET_SIZE,
  draftFontFamily,
  draftValueFont
} from './widget-defaults'

interface InsertionTarget {
  widgets: WidgetConfiguration[]
  cap: number
  box?: Required<WidgetPlacement>
  depth: number
}

function containerTarget(
  configuration: DeviceConfiguration,
  containerId: string,
  page?: number
): InsertionTarget | undefined {
  const location = findWidget(configuration, containerId)
  const container = location?.widget
  if (!location || !container) return undefined
  const box = absolutePlacement(configuration, containerId)
  const depth = ancestorsOf(configuration, location).length + 1
  if (container.type === 'shape') {
    return { widgets: (container.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_CONTAINER, box, depth }
  }
  if (container.type !== 'slot') return undefined
  const pages = pagesOf(container)
  const chosen =
    pages[page ?? visibleSlotPage(container, useDashboardEditorStore.getState().slotPage)]
  return chosen
    ? { widgets: (chosen.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_CONTAINER, box, depth }
    : undefined
}

function insertionTarget(configuration: DeviceConfiguration): InsertionTarget | undefined {
  const { drillIn, selection } = useDashboardEditorStore.getState()
  const opened = drillIn ? containerTarget(configuration, drillIn) : undefined
  if (opened) return opened
  const picked =
    selection?.type === 'widget' && isContainerId(configuration, selection.id)
      ? containerTarget(configuration, selection.id)
      : undefined
  if (picked) return picked
  return screenTarget(configuration)
}

function screenTarget(configuration: DeviceConfiguration): InsertionTarget {
  const screen = ensureScreen(configuration)
  return { widgets: (screen.widgets ??= []), cap: MAXIMUM_WIDGETS_PER_SCREEN, depth: 0 }
}

function isContainerId(configuration: DeviceConfiguration, id: string): boolean {
  const widget = findWidget(configuration, id)?.widget
  return widget !== undefined && isContainer(widget)
}

function intoContainer(
  placement: WidgetPlacement | undefined,
  box: Required<WidgetPlacement>
): WidgetPlacement | undefined {
  const absolute = completePlacement(placement)
  if (!absolute) return placement
  const relative = { ...absolute, x: absolute.x - box.x, y: absolute.y - box.y }
  const misses =
    relative.x + relative.width <= 0 ||
    relative.y + relative.height <= 0 ||
    relative.x >= box.width ||
    relative.y >= box.height
  return misses ? centeredPlacement(box, absolute) : relative
}

export function insertWidget(
  configuration: DeviceConfiguration,
  widget: WidgetConfiguration,
  into: InsertionTarget | undefined = insertionTarget(configuration)
): WidgetSelection | undefined {
  if (!into) return undefined
  const { widgets, cap, box, depth } = into
  if (box && widget.type === 'slot') return undefined
  if (depth + subtreeHeight(widget) >= MAXIMUM_NESTING_DEPTH) return undefined
  if (widgets.length >= cap) return undefined
  if (insertionRefusal(configuration, widget)) return undefined
  const inserted = freshWidgetIds(structuredClone(widget))
  if (box) inserted.placement = intoContainer(widget.placement, box)
  widgets.push(inserted)
  return { type: 'widget', id: inserted.id }
}

export function addWidget(
  type: WidgetConfiguration['type'],
  display: { width: number; height: number },
  extras: NewWidgetExtras = {}
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const widget = WIDGET_DEFAULTS[type](display, extras)
    if (extras.placement) widget.placement = extras.placement
    added = insertWidget(configuration, widget, drawnTarget(configuration, extras.into))
    return added !== undefined
  })
  return added
}

function drawnTarget(
  configuration: DeviceConfiguration,
  into: string | 'screen' | undefined
): InsertionTarget | undefined {
  if (into === undefined) return undefined
  return into === 'screen' ? screenTarget(configuration) : containerTarget(configuration, into)
}

export function deleteWidget(selection: WidgetSelection): boolean {
  if (selection.type !== 'widget') return false
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (!location) return false
    const widgets = widgetArrayOf(configuration, location)
    const index = location.path[location.path.length - 1]
    if (!widgets || index === undefined) return false
    widgets.splice(index, 1)
    deleted = true
    if (widgets.length > 0) return true
    const owner = parentOf(configuration, location)
    if (owner) delete owner.widgets
    return true
  })
  return deleted
}

const DUPLICATE_OFFSET_PX = 8

export function duplicateWidget(
  selection: WidgetSelection,
  display: { width: number; height: number }
): WidgetSelection | undefined {
  if (selection.type !== 'widget') return undefined
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (!location) return false
    const box = absolutePlacement(configuration, selection.id)
    const lifted = box ? { ...location.widget, placement: box } : location.widget
    added = insertWidget(
      configuration,
      offsetWidget(lifted, display),
      sourceTarget(configuration, location)
    )
    return added !== undefined
  })
  return added
}

function sourceTarget(
  configuration: DeviceConfiguration,
  location: WidgetLocation
): InsertionTarget | undefined {
  const parent = ancestorsOf(configuration, location).at(-1)
  if (!parent?.id) return screenTarget(configuration)
  const page = parent.type === 'slot' ? location.path[location.path.length - 2] : undefined
  return containerTarget(configuration, parent.id, page)
}

export function offsetWidget(
  widget: WidgetConfiguration,
  display: { width: number; height: number }
): WidgetConfiguration {
  const placement = completePlacement(widget.placement)
  if (!placement) return structuredClone(widget)
  return {
    ...structuredClone(widget),
    placement: {
      ...placement,
      x: Math.min(placement.x + DUPLICATE_OFFSET_PX, display.width - placement.width),
      y: Math.min(placement.y + DUPLICATE_OFFSET_PX, display.height - placement.height)
    }
  }
}

export function actionCount(configuration: DeviceConfiguration | undefined): number {
  return allWidgetsOf(configuration).filter(
    (target) => target.action && target.action.type !== 'none'
  ).length
}

export function addTapZone(
  display: { width: number; height: number },
  extras: Pick<NewWidgetExtras, 'placement' | 'into'> = {}
): string | undefined {
  let created: string | undefined
  mutateDraftConfiguration((configuration) => {
    const selection = insertWidget(
      configuration,
      {
        type: 'shape',
        kind: 'rectangle',
        placement:
          extras.placement ??
          centeredPlacement(display, { width: TAP_ZONE_PX, height: TAP_ZONE_PX })
      },
      drawnTarget(configuration, extras.into)
    )
    created = selection?.type === 'widget' ? selection.id : undefined
    return created !== undefined
  })
  return created
}

const TAP_ZONE_PX = 96

export function applyFontFamilyToDashboard(family: string): void {
  mutateDraftConfiguration((configuration) => {
    for (const widget of allWidgetsOf(configuration)) applyFontFamily(widget, family)
  })
}
