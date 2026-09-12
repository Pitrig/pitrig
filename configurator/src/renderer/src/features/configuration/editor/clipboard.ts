import { screensOf } from '@shared/configuration-access'
import { type WidgetConfiguration } from '@shared/configuration-schema'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import { BOARD_PROFILES, type DeviceConfiguration } from '@shared/device'
import { absolutePlacement, findWidget, mutateDraftConfiguration } from './document'
import { useDashboardEditorStore, type WidgetSelection } from './store'
import { insertWidget, offsetWidget } from './widgets'
import { useDeviceStore } from '@/features/device/device-store'

let internalClipboard: WidgetConfiguration[] | undefined
let writtenText: string | undefined

export async function copyWidget(
  configuration: DeviceConfiguration | undefined,
  selection: WidgetSelection | undefined
): Promise<boolean> {
  if (!configuration || selection?.type !== 'widget') return false
  const selected = useDashboardEditorStore.getState().selectedIds
  const ids = selected.includes(selection.id) ? selected : [selection.id]
  const lifted = ids
    .map((id) => liftWidget(configuration, id))
    .filter((widget): widget is WidgetConfiguration => widget !== undefined)
  if (lifted.length === 0) return false
  internalClipboard = structuredClone(lifted)
  writtenText = JSON.stringify(lifted.length === 1 ? lifted[0] : lifted, null, 2)
  try {
    await navigator.clipboard.writeText(writtenText)
  } catch {
  }
  return true
}

export async function pasteWidget(
  display: { width: number; height: number }
): Promise<WidgetSelection | undefined> {
  const widgets = await clipboardWidgets()
  if (!widgets || widgets.length === 0) return undefined
  let added: WidgetSelection | undefined
  mutateDraftConfiguration((configuration) => {
    for (const widget of widgets) {
      added = insertWidget(configuration, offsetWidget(widget, display)) ?? added
    }
    return added !== undefined
  })
  return added
}

function liftWidget(
  configuration: DeviceConfiguration,
  id: string
): WidgetConfiguration | undefined {
  const widget = findWidget(configuration, id)?.widget
  if (!widget) return undefined
  const box = absolutePlacement(configuration, id)
  return box ? { ...widget, placement: box } : widget
}

async function clipboardWidgets(): Promise<WidgetConfiguration[] | undefined> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    return internalClipboard
  }
  if (text === writtenText) return internalClipboard
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return internalClipboard
  }
  const widgets = Array.isArray(value) ? (value as unknown[]) : [value]
  return isPasteable(widgets) ? (widgets as WidgetConfiguration[]) : internalClipboard
}

function isPasteable(widgets: readonly unknown[]): boolean {
  if (widgets.length === 0) return false
  if (
    widgets.some(
      (widget) => typeof widget !== 'object' || widget === null || Array.isArray(widget)
    )
  ) {
    return false
  }
  const draft = useDeviceStore.getState().draft
  if (!draft) return false
  const named = screensOf(draft).map((screen, index) => screen.id ?? `screen${index + 1}`)
  const ids = named.length > 0 ? named : ['screen1']
  const probe = {
    board: draft.board,
    dashboard: {
      screens: ids.map((id, index) => (index === 0 ? { id, widgets } : { id }))
    }
  }
  return validateConfigurationDocument(probe, {
    supportedBoards: Object.keys(BOARD_PROFILES)
  }).ok
}
