import { create } from 'zustand'

import {
  createWidgetId,
  screensOf,
  widgetsOf
} from '../../../../shared/configuration-access'
import {
  MAXIMUM_TEXT_WIDGETS,
  MAXIMUM_WIDGETS_PER_SCREEN
} from '../../../../shared/configuration-schema'
import type {
  DeltaTimeWidgetConfiguration,
  FontSpec,
  ScreenConfiguration,
  TextWidgetConfiguration,
  WidgetConfiguration,
  WidgetPlacement
} from '../../../../shared/configuration-schema'
import type { DeviceConfiguration } from '../../../../shared/device'
import { useDeviceStore } from '@/features/device/device-store'

export type { WidgetPlacement as Placement }
export { MAXIMUM_TEXT_WIDGETS, MAXIMUM_WIDGETS_PER_SCREEN }

// Selection addresses a widget by its stable id. Index-based selection silently
// retargeted to a different widget whenever a sibling was deleted or reordered.
export type WidgetSelection =
  | { type: 'screen' }
  | { type: 'widget'; id: string }

interface DashboardEditorStore {
  selection?: WidgetSelection
  select: (selection?: WidgetSelection) => void
}

export const useDashboardEditorStore = create<DashboardEditorStore>((set) => ({
  select: (selection) => set({ selection })
}))

export interface WidgetLocation {
  screenIndex: number
  widgetIndex: number
  widget: WidgetConfiguration
}

export function activeScreen(
  configuration: DeviceConfiguration | undefined
): ScreenConfiguration | undefined {
  return screensOf(configuration)[0]
}

export function findWidget(
  configuration: DeviceConfiguration | undefined,
  id: string
): WidgetLocation | undefined {
  const screens = screensOf(configuration)
  for (let screenIndex = 0; screenIndex < screens.length; ++screenIndex) {
    const widgets = widgetsOf(screens[screenIndex])
    const widgetIndex = widgets.findIndex((widget) => widget.id === id)
    const widget = widgets[widgetIndex]
    if (widgetIndex >= 0 && widget) {
      return { screenIndex, widgetIndex, widget }
    }
  }
  return undefined
}

export function selectedWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): WidgetConfiguration | undefined {
  if (!selection || selection.type === 'screen') return undefined
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

export function mutateActiveScreen(
  mutation: (screen: ScreenConfiguration, configuration: DeviceConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const screen = ensureScreen(configuration)
    mutation(screen, configuration)
  })
}

/** Returns the first screen, creating the dashboard section if it is absent. */
function ensureScreen(configuration: DeviceConfiguration): ScreenConfiguration {
  const dashboard = (configuration.dashboard ??= {})
  const screens = (dashboard.screens ??= [])
  const existing = screens[0]
  if (existing) return existing
  const created: ScreenConfiguration = { id: 'screen1' }
  screens.push(created)
  return created
}

// A widget with no font is rejected by the device as a whole-document error,
// so a newly added one adopts an installed font when the board has any. Without
// fonts installed it is created bare and the validator explains why.
export function addTextWidget(
  display: { width: number; height: number },
  font?: FontSpec
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const screen = ensureScreen(configuration)
    const widgets = (screen.widgets ??= [])
    const textCount = widgets.filter((widget) => widget.type === 'text').length
    if (textCount >= MAXIMUM_TEXT_WIDGETS || widgets.length >= MAXIMUM_WIDGETS_PER_SCREEN) {
      return
    }
    const width = Math.min(120, display.width)
    const height = Math.min(64, display.height)
    const widget: TextWidgetConfiguration = {
      type: 'text',
      id: createWidgetId(),
      ...(font ? { value: { font } } : {}),
      placement: {
        x: Math.floor((display.width - width) / 2),
        y: Math.floor((display.height - height) / 2),
        width,
        height
      }
    }
    widgets.push(widget)
    added = { type: 'widget', id: widget.id as string }
  })
  return added
}

export function addDeltaTimeWidget(
  display: { width: number; height: number },
  font?: FontSpec
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const screen = ensureScreen(configuration)
    const widgets = (screen.widgets ??= [])
    if (widgets.some((widget) => widget.type === 'delta_time')) return
    if (widgets.length >= MAXIMUM_WIDGETS_PER_SCREEN) return
    const width = Math.min(184, display.width)
    const height = Math.min(52, display.height)
    const widget: DeltaTimeWidgetConfiguration = {
      type: 'delta_time',
      id: createWidgetId(),
      ...(font ? { font } : {}),
      placement: {
        x: Math.floor((display.width - width) / 2),
        y: Math.floor((display.height - height) / 2),
        width,
        height
      }
    }
    widgets.push(widget)
    // The widget renders module state, so the module section must exist.
    configuration.delta_time ??= {}
    added = { type: 'widget', id: widget.id as string }
  })
  return added
}

export function deleteWidget(selection: WidgetSelection): boolean {
  if (selection.type !== 'widget') return false
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const location = findWidget(configuration, selection.id)
    if (!location) return
    const screen = configuration.dashboard?.screens?.[location.screenIndex]
    if (!screen?.widgets) return
    const [removed] = screen.widgets.splice(location.widgetIndex, 1)
    deleted = true
    if (removed?.type === 'delta_time') delete configuration.delta_time
    if (screen.widgets.length === 0) delete screen.widgets
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
