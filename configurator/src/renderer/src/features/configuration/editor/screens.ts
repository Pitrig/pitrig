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

export function ensureScreen(
  configuration: DeviceConfiguration,
  index = useDashboardEditorStore.getState().activeScreenIndex
): ScreenConfiguration {
  const dashboard = (configuration.dashboard ??= {})
  const screens = (dashboard.screens ??= [])
  const bounded = Math.min(Math.max(index, 0), MAXIMUM_SCREENS - 1)
  while (screens.length <= bounded) {
    screens.push({ id: `screen${screens.length + 1}` })
  }
  return screens[bounded]!
}

export function addScreen(): number | undefined {
  let added: number | undefined
  mutateDraftConfiguration((configuration) => {
    const screens = ((configuration.dashboard ??= {}).screens ??= [])
    if (screens.length === 0) screens.push({ id: 'screen1' })
    if (screens.length >= MAXIMUM_SCREENS) return
    screens.push({ id: `screen${screens.length + 1}` })
    added = screens.length - 1
  })
  return added
}

export function deleteScreen(index: number): boolean {
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const screens = configuration.dashboard?.screens
    if (!screens || index <= 0 || index >= screens.length) return
    const removed = screens[index]?.id
    screens.splice(index, 1)
    deleted = true
    if (removed === undefined) return
    for (const target of allWidgetsOf(configuration)) {
      if (target.action?.type === 'goto_screen' && target.action.screen === removed) {
        delete target.action
      }
    }
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
    if (!screens || from === to) return
    if (from < 0 || from >= screens.length || to < 0 || to >= screens.length) return
    const [screen] = screens.splice(from, 1)
    if (!screen) return
    screens.splice(to, 0, screen)
    moved = true
  })
  if (moved) useDashboardEditorStore.getState().setActiveScreen(to)
  return moved
}
