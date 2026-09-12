import { freshWidgetIds, screensOf, screenWidgetsOf, widgetsOf } from '@shared/configuration-access'
import { MAXIMUM_SCREENS } from '@shared/configuration-schema'
import type { ScreenConfiguration } from '@shared/configuration-schema'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import { PITRIG_BOARD_IDS, type DeviceConfiguration } from '@shared/device'
import { transferConfiguration, type LayoutFit } from '@shared/layout-transfer'
import { freeScreenId } from '@/features/configuration/dashboard-editor'
import { useDeviceStore } from '@/features/device/device-store'
import { t } from '@shared/ui-text'

export function insertScreensFromDocument(
  source: DeviceConfiguration,
  screenIndices: readonly number[],
  target: { board: DeviceConfiguration['board']; fit: LayoutFit }
): { ok: true; index: number } | { ok: false; error: string } {
  const draft = useDeviceStore.getState().draft
  if (!draft) return { ok: false, error: t('templates.insertScreen.thereIsNoDashboardTo') }

  const existing = screensOf(draft)
  const screens = existing.length > 0 ? existing : [{ id: 'screen1' } as ScreenConfiguration]
  if (screens.length + screenIndices.length > MAXIMUM_SCREENS) {
    return {
      ok: false,
      error: t('templates.insertScreen.aDashboardHoldsAtMost', { maximum: MAXIMUM_SCREENS })
    }
  }

  const transferred = transferConfiguration(source, { board: target.board, fit: target.fit })
  const imported = screensOf(transferred.configuration)
  const taken: ScreenConfiguration[] = []
  for (const index of screenIndices) {
    const screen = imported[index]
    if (!screen) return { ok: false, error: t('templates.insertScreen.thatDashboardHasNoSuch') }
    taken.push(screen)
  }

  const renamed = new Map<string, string>()
  const added: ScreenConfiguration[] = []
  for (const screen of taken) {
    const copy = structuredClone(screen)
    const id = freeScreenId([...screens, ...added])
    if (copy.id !== undefined) renamed.set(copy.id, id)
    copy.id = id
    copy.widgets = widgetsOf(copy).map((widget) => freshWidgetIds(structuredClone(widget)))
    added.push(copy)
  }
  for (const screen of added) {
    for (const widget of screenWidgetsOf(screen)) {
      if (!('action' in widget) || widget.action?.type !== 'goto_screen') continue
      const mapped = widget.action.screen === undefined ? undefined : renamed.get(widget.action.screen)
      if (mapped) widget.action = { ...widget.action, screen: mapped }
      else delete widget.action
    }
  }

  const candidate: DeviceConfiguration = {
    ...draft,
    dashboard: { ...draft.dashboard, screens: [...screens, ...added] }
  }

  const validated = validateConfigurationDocument(candidate, {
    supportedBoards: PITRIG_BOARD_IDS
  })
  if (!validated.ok) {
    return {
      ok: false,
      error: t('templates.insertScreen.thatScreenWouldNotBe', { error: validated.error })
    }
  }
  useDeviceStore.getState().setDraft(validated.configuration)
  return { ok: true, index: screens.length }
}
