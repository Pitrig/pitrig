import { withWidgetIds } from '@shared/configuration-access'
import { mergeDocument } from '@shared/configuration-documents'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import {
  applyBoardTransportDefaults,
  PITRIG_BOARD_IDS,
  type DeviceConfiguration,
  type PitrigBoardId
} from '@shared/device'
import {
  transferConfiguration,
  type LayoutFit,
  type LayoutTransferResult
} from '@shared/layout-transfer'

export type AdoptedDashboard =
  | { ok: true; configuration: DeviceConfiguration; report: LayoutTransferResult }
  | { ok: false; error: string }

export function adoptDashboard(
  source: DeviceConfiguration,
  target: {
    draft?: DeviceConfiguration
    board?: PitrigBoardId
    display?: { width: number; height: number }
    fit: LayoutFit
  }
): AdoptedDashboard {
  const board = target.board ?? target.draft?.board ?? source.board
  const transferred = transferConfiguration(source, {
    board,
    display: target.display,
    fit: target.fit
  })
  const adopted = applyBoardTransportDefaults(
    withWidgetIds(
      target.draft
        ? mergeDocument(target.draft, 'dashboard', transferred.configuration)
        : transferred.configuration
    )
  )
  const validated = validateConfigurationDocument(adopted, { supportedBoards: PITRIG_BOARD_IDS })
  if (!validated.ok) return { ok: false, error: validated.error }
  return { ok: true, configuration: validated.configuration, report: transferred }
}
