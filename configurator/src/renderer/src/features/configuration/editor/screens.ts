import { allWidgetsOf } from '@shared/configuration-access'
import { MAXIMUM_SCREENS, type ScreenConfiguration } from '@shared/configuration-schema'
import { type DeviceConfiguration } from '@shared/device'
import { mutateDraftConfiguration } from './document'
import { useDashboardEditorStore } from './store'

export function mutateActiveScreen(
  mutation: (screen: ScreenConfiguration, configuration: DeviceConfiguration) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const screen = ensureScreen(configuration)
    mutation(screen, configuration)
  })
}

export function freeScreenId(screens: readonly ScreenConfiguration[]): string {
  const taken = new Set(screens.map((screen) => screen.id))
  for (let index = 1; index <= MAXIMUM_SCREENS + 1; index += 1) {
    const id = `screen${index}`
    if (!taken.has(id)) return id
  }
  return `screen${screens.length + 1}`
}

export function ensureScreen(
  configuration: DeviceConfiguration,
  index = useDashboardEditorStore.getState().activeScreenIndex
): ScreenConfiguration {
  const dashboard = (configuration.dashboard ??= {})
  const screens = (dashboard.screens ??= [])
  if (screens.length === 0) screens.push({ id: freeScreenId(screens) })
  const bounded = Math.min(Math.max(index, 0), screens.length - 1)
  return screens[bounded]!
}

export function addScreen(): number | undefined {
  let added: number | undefined
  mutateDraftConfiguration((configuration) => {
    const screens = ((configuration.dashboard ??= {}).screens ??= [])
    if (screens.length === 0) screens.push({ id: freeScreenId(screens) })
    if (screens.length >= MAXIMUM_SCREENS) return false
    screens.push({ id: freeScreenId(screens) })
    added = screens.length - 1
    return true
  })
  return added
}

export function deleteScreen(index: number): boolean {
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const screens = configuration.dashboard?.screens
    if (!screens || index <= 0 || index >= screens.length) return false
    const removed = screens[index]?.id
    screens.splice(index, 1)
    deleted = true
    if (removed === undefined) return true
    for (const target of allWidgetsOf(configuration)) {
      if (target.action?.type === 'goto_screen' && target.action.screen === removed) {
        delete target.action
      }
    }
    return true
  })
  if (deleted) {
    const editor = useDashboardEditorStore.getState()
    editor.select(undefined)
    editor.setActiveScreen(Math.max(index - 1, 0))
  }
  return deleted
}

export function moveScreen(from: number, to: number): boolean {
  let moved = false
  mutateDraftConfiguration((configuration) => {
    const screens = configuration.dashboard?.screens
    if (!screens || from === to) return false
    if (from < 0 || from >= screens.length || to < 0 || to >= screens.length) return false
    const [screen] = screens.splice(from, 1)
    if (!screen) return false
    screens.splice(to, 0, screen)
    moved = true
    return true
  })
  if (moved) useDashboardEditorStore.getState().setActiveScreen(to)
  return moved
}
