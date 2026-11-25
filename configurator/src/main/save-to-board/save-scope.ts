import { t } from '@shared/ui-text'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import { documentsDiffering } from '../../shared/configuration-documents'
import type { SaveToBoardRequest } from '../../shared/save-to-board'
import type { DeviceConfiguration, DeviceSession } from '../../shared/device'
import { stepFailure, type SaveStep } from './save-results'

export interface SaveScope {
  request: SaveToBoardRequest
  configuration: DeviceConfiguration
  keepBoardAssets: boolean
}

export interface BoardView {
  session: DeviceSession
  changed: ConfigurationDocumentId[]
  safeMode: boolean
  assetsInScope: boolean
}

export function boardView(scope: SaveScope, session: DeviceSession): SaveStep<BoardView> {
  if (scope.configuration.board !== session.info.boardId) {
    return stepFailure(
      'invalid_configuration',
      t('device.draftState.theDraftTargetsBoardThe', {
        board: scope.configuration.board,
        boardId: session.info.boardId
      })
    )
  }
  const requested = scope.request.documents
  const changed = documentsDiffering(scope.configuration, session.configuration).filter(
    (document) => requested === undefined || requested.includes(document)
  )
  const safeMode = session.info.health?.safeMode ?? false
  const assetsInScope = !safeMode && (requested === undefined || requested.includes('dashboard'))
  return { ok: true, value: { session, changed, safeMode, assetsInScope } }
}

export function describeSaving(documents: ConfigurationDocumentId[]): string {
  if (documents.length === CONFIGURATION_DOCUMENT_IDS.length) {
    return t('save.stage.saving')
  }
  const names = documents.map((document) => t(`documents.labelLower.${document}`))
  return t('save.saveToBoardService.savingTheAndConfiguration', { and: names.join(' and ') })
}
