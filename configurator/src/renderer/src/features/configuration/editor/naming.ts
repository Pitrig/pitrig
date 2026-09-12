import { allWidgetsOf, screensOf } from '@shared/configuration-access'
import { WIDGET_ID_CAPACITY } from '@shared/configuration-schema'
import { findWidget, mutateDraftConfiguration } from './document'
import { ensureScreen } from './screens'
import { useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

export function renameWidget(id: string, name: string): boolean {
  const trimmed = usableId(name, id)
  if (!trimmed) return false
  const renamed = mutateDraftConfiguration((next) => {
    const widget = findWidget(next, id)?.widget
    if (!widget) return false
    widget.id = trimmed
    return true
  })
  if (renamed) useDashboardEditorStore.getState().renameId(id, trimmed)
  return renamed
}

export function renameScreen(index: number, name: string): boolean {
  const trimmed = name.trim()
  const configuration = useDeviceStore.getState().draft
  const screens = screensOf(configuration)
  const current = screens[index]?.id
  if (!configuration || !screens[index] || trimmed.length === 0 || trimmed === current) return false
  if (new TextEncoder().encode(trimmed).byteLength >= WIDGET_ID_CAPACITY) return false
  if (screens.some((screen) => screen.id === trimmed)) return false
  mutateDraftConfiguration((next) => {
    const screen = ensureScreen(next, index)
    screen.id = trimmed
    for (const target of allWidgetsOf(next)) {
      if (target.action?.type === 'goto_screen' && target.action.screen === current) {
        target.action = { ...target.action, screen: trimmed }
      }
    }
  })
  return true
}

function usableId(name: string, current: string): string | undefined {
  const trimmed = name.trim()
  const configuration = useDeviceStore.getState().draft
  if (!configuration || trimmed.length === 0 || trimmed === current) return undefined
  if (new TextEncoder().encode(trimmed).byteLength >= WIDGET_ID_CAPACITY) return undefined
  const taken = allWidgetsOf(configuration).map((widget) => widget.id)
  return taken.includes(trimmed) ? undefined : trimmed
}
