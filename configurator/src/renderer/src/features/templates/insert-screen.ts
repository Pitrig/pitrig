import { freshWidgetIds, screensOf, widgetsOf } from '@shared/configuration-access'
import { MAXIMUM_SCREENS } from '@shared/configuration-schema'
import type { ScreenConfiguration } from '@shared/configuration-schema'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import { SIMCORE_BOARD_IDS, type DeviceConfiguration } from '@shared/device'
import { transferConfiguration, type LayoutFit } from '@shared/layout-transfer'
import { useDeviceStore } from '@/features/device/device-store'

export function insertScreenFromDocument(
  source: DeviceConfiguration,
  screenIndex: number,
  target: { board: DeviceConfiguration['board']; display?: { width: number; height: number }; fit: LayoutFit }
): { ok: true; index: number } | { ok: false; error: string } {
  const draft = useDeviceStore.getState().draft
  if (!draft) return { ok: false, error: 'There is no dashboard to add a screen to.' }

  const existing = screensOf(draft)
  const screens = existing.length > 0 ? existing : [{ id: 'screen1' } as ScreenConfiguration]
  if (screens.length >= MAXIMUM_SCREENS) {
    return { ok: false, error: `A dashboard holds at most ${MAXIMUM_SCREENS} screens.` }
  }

  const transferred = transferConfiguration(source, {
    board: target.board,
    display: target.display,
    fit: target.fit
  })
  const imported = screensOf(transferred.configuration)[screenIndex]
  if (!imported) return { ok: false, error: 'That dashboard has no such screen.' }

  const taken = structuredClone(imported)
  const candidate: DeviceConfiguration = {
    ...draft,
    dashboard: {
      ...draft.dashboard,
      screens: [
        ...screens,
        {
          ...taken,
          id: freeScreenId(screens),
          widgets: widgetsOf(taken).map((widget) => freshWidgetIds(structuredClone(widget)))
        }
      ]
    }
  }

  const validated = validateConfigurationDocument(candidate, {
    supportedBoards: SIMCORE_BOARD_IDS
  })
  if (!validated.ok) {
    return {
      ok: false,
      error: `That screen would not be accepted here, so nothing changed. ${validated.error}`
    }
  }
  useDeviceStore.getState().setDraft(validated.configuration)
  return { ok: true, index: screens.length }
}

function freeScreenId(screens: readonly ScreenConfiguration[]): string {
  const taken = new Set(screens.map((screen) => screen.id))
  for (let index = 1; index <= MAXIMUM_SCREENS + 1; index += 1) {
    const id = `screen${index}`
    if (!taken.has(id)) return id
  }
  return `screen${screens.length + 1}`
}
