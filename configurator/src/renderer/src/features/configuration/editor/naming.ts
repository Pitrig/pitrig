import { allWidgetsOf, screensOf } from '../../../../../shared/configuration-access'
import { WIDGET_ID_CAPACITY } from '../../../../../shared/configuration-schema'
import { findWidget, mutateDraftConfiguration } from './document'
import { useDashboardEditorStore } from './store'
import { useDeviceStore } from '@/features/device/device-store'

export function renameWidget(id: string, name: string): boolean {
  const trimmed = usableId(name, id)
  if (!trimmed) return false
  mutateDraftConfiguration((next) => {
    const widget = findWidget(next, id)?.widget
    if (widget) widget.id = trimmed
  })
  useDashboardEditorStore.getState().renameId(id, trimmed)
  return true
}

/**
 * Renames a screen and repoints every action that named it. A `goto_screen`
 * addresses its target by id, so a rename that left the actions alone would
 * quietly break every button pointing at the screen — the device would reject
 * the document, but only after the author had moved on.
 */
export function renameScreen(index: number, name: string): boolean {
  const trimmed = name.trim()
  const configuration = useDeviceStore.getState().draft
  const screens = screensOf(configuration)
  const current = screens[index]?.id
  if (!configuration || trimmed.length === 0 || trimmed === current) return false
  if (new TextEncoder().encode(trimmed).byteLength >= WIDGET_ID_CAPACITY) return false
  if (screens.some((screen) => screen.id === trimmed)) return false
  mutateDraftConfiguration((next) => {
    const screen = next.dashboard?.screens?.[index]
    if (!screen) return
    screen.id = trimmed
    for (const target of allWidgetsOf(next)) {
      if (target.action?.type === 'goto_screen' && target.action.screen === current) {
        target.action = { ...target.action, screen: trimmed }
      }
    }
  })
  return true
}

/**
 * A name a widget may take: non-empty, within what the device stores, and not
 * already used. Containers are widgets, so one namespace covers everything that
 * selection, the layer tree and undo history address by id.
 */
function usableId(name: string, current: string): string | undefined {
  const trimmed = name.trim()
  const configuration = useDeviceStore.getState().draft
  if (!configuration || trimmed.length === 0 || trimmed === current) return undefined
  if (new TextEncoder().encode(trimmed).byteLength >= WIDGET_ID_CAPACITY) return undefined
  const taken = allWidgetsOf(configuration).map((widget) => widget.id)
  return taken.includes(trimmed) ? undefined : trimmed
}
