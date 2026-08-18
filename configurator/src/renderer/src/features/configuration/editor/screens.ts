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

/**
 * Returns the screen being edited, creating the dashboard section and every
 * screen up to it if they are absent. A document is sparse, so the array can be
 * shorter than the index the editor is pointing at.
 */
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
    if (screens.length >= MAXIMUM_SCREENS) return
    screens.push({ id: `screen${screens.length + 1}` })
    added = screens.length - 1
  })
  return added
}

/**
 * Removes a screen with everything on it. The first screen cannot go: a
 * dashboard with no screen has nothing to compose, and the editor would have no
 * canvas to draw.
 */
export function deleteScreen(index: number): boolean {
  let deleted = false
  mutateDraftConfiguration((configuration) => {
    const screens = configuration.dashboard?.screens
    if (!screens || index <= 0 || index >= screens.length) return
    const removed = screens[index]?.id
    screens.splice(index, 1)
    deleted = true
    // A goto_screen that named the removed screen would fail validation and
    // the author would learn about it only on apply, so those actions go with
    // the screen. next/previous keep working: they never named it.
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

// Widget storage is a dashboard-wide pool, so a per-type cap is a budget across
// every screen rather than a per-screen allowance.
