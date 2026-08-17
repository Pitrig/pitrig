import { allWidgetsOf, groupsOf, screensOf } from '../../../../../shared/configuration-access'
import { WIDGET_ID_CAPACITY } from '../../../../../shared/configuration-schema'
import { findWidget, mutateDraftConfiguration, mutateGroup } from './document'
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

/** Renames a group, which shares its id namespace with the widgets. */
export function renameGroup(id: string, name: string): boolean {
  const trimmed = usableId(name, id)
  if (!trimmed) return false
  mutateGroup(id, (group) => {
    group.id = trimmed
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
    for (const target of [
      ...allWidgetsOf(next),
      ...screensOf(next).flatMap(groupsOf)
    ]) {
      if (target.action?.type === 'goto_screen' && target.action.screen === current) {
        target.action = { ...target.action, screen: trimmed }
      }
    }
  })
  return true
}

/**
 * A name a widget or a group may take: non-empty, within what the device
 * stores, and not already used by either. The two share one namespace because
 * both are addressed by id in selection, the layer tree and undo history.
 */
function usableId(name: string, current: string): string | undefined {
  const trimmed = name.trim()
  const configuration = useDeviceStore.getState().draft
  if (!configuration || trimmed.length === 0 || trimmed === current) return undefined
  if (new TextEncoder().encode(trimmed).byteLength >= WIDGET_ID_CAPACITY) return undefined
  const taken = [
    ...allWidgetsOf(configuration).map((widget) => widget.id),
    ...screensOf(configuration).flatMap(groupsOf).map((group) => group.id)
  ]
  return taken.includes(trimmed) ? undefined : trimmed
}
