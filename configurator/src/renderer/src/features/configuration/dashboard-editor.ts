import { create } from 'zustand'

import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import type { DeviceConfiguration, Placement } from '../../../../shared/device'

export type WidgetSelection =
  | { type: 'screen' }
  | { type: 'delta_time' }
  | { type: 'text'; index: number }

export type DashboardWidgets = NonNullable<NonNullable<DeviceConfiguration['dashboard']>['widgets']>
export type TextWidgetConfiguration = NonNullable<DashboardWidgets['text']>[number]
export type DeltaTimeWidgetConfiguration = NonNullable<DashboardWidgets['delta_time']>
export const MAXIMUM_TEXT_WIDGETS = 16

interface DashboardEditorStore {
  selection?: WidgetSelection
  select: (selection?: WidgetSelection) => void
}

export const useDashboardEditorStore = create<DashboardEditorStore>((set) => ({
  select: (selection) => set({ selection })
}))

export function parseDraftConfiguration(json: string): DeviceConfiguration | undefined {
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as DeviceConfiguration
      : undefined
  } catch {
    return undefined
  }
}

export function selectedWidget(
  configuration: DeviceConfiguration,
  selection: WidgetSelection | undefined
): DeltaTimeWidgetConfiguration | TextWidgetConfiguration | undefined {
  if (!selection) return undefined
  const widgets = configuration.dashboard?.widgets
  return selection.type === 'screen'
    ? undefined
    : selection.type === 'delta_time'
    ? widgets?.delta_time
    : widgets?.text?.[selection.index]
}

export function mutateDraftConfiguration(
  mutation: (configuration: DeviceConfiguration) => void
): void {
  const store = useDeviceStore.getState()
  const configuration = parseDraftConfiguration(store.draftConfigurationJson)
  if (!configuration) return
  const next = structuredClone(configuration)
  mutation(next)
  store.setDraftConfigurationJson(formatConfiguration(next))
}

export function mutateSelectedWidget(
  selection: WidgetSelection,
  mutation: (
    widget: DeltaTimeWidgetConfiguration | TextWidgetConfiguration,
    configuration: DeviceConfiguration
  ) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const widget = selectedWidget(configuration, selection)
    if (widget) mutation(widget, configuration)
  })
}

export function addEmptyTextWidget(
  display: { width: number; height: number }
): WidgetSelection | undefined {
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    const text = configuration.dashboard?.widgets?.text ?? []
    if (text.length >= MAXIMUM_TEXT_WIDGETS) return
    const width = Math.min(120, display.width)
    const height = Math.min(64, display.height)
    configuration.dashboard = {
      ...configuration.dashboard,
      widgets: {
        ...configuration.dashboard?.widgets,
        text: [...text, {
          placement: {
            x: Math.floor((display.width - width) / 2),
            y: Math.floor((display.height - height) / 2),
            width,
            height
          }
        }]
      }
    }
    added = { type: 'text', index: text.length }
  })
  return added
}

export function deleteWidget(selection: WidgetSelection): boolean {
  if (selection.type === 'screen') return false
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const widgets = configuration.dashboard?.widgets
    if (!widgets) return
    if (selection.type === 'delta_time') {
      if (!widgets.delta_time) return
      delete widgets.delta_time
      delete configuration.delta_time
      deleted = true
    } else {
      if (!widgets.text?.[selection.index]) return
      widgets.text.splice(selection.index, 1)
      if (widgets.text.length === 0) delete widgets.text
      deleted = true
    }
    if (!widgets.delta_time && !widgets.text) delete configuration.dashboard?.widgets
    if (configuration.dashboard && Object.keys(configuration.dashboard).length === 0) {
      delete configuration.dashboard
    }
  })
  return deleted
}

export function completePlacement(placement: Placement | undefined): Required<Placement> | undefined {
  if (
    !placement ||
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.width) ||
    !Number.isFinite(placement.height) ||
    (placement.width ?? 0) <= 0 ||
    (placement.height ?? 0) <= 0
  ) return undefined
  return placement as Required<Placement>
}
