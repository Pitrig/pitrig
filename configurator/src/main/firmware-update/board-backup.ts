import { MAXIMUM_CONFIGURATION_NAME } from '../../shared/config-library'
import {
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '../../shared/configuration-schema'
import type { DeviceConfiguration, DeviceSession } from '../../shared/device'
import { newerDocumentsReason } from '../../shared/newer-documents'
import type { ConfigLibraryService } from '../configs/config-library-service'
import { t } from '@shared/ui-text'

export interface BoardBackup {
  id: string
  name: string
  configuration: DeviceConfiguration
  documents: ConfigurationDocumentId[]
}

export type BackupOutcome =
  | { ok: true; value: BoardBackup | undefined }
  | { ok: false; message: string }

export async function backUpBoard(
  library: ConfigLibraryService,
  session: DeviceSession,
  onStart: () => void
): Promise<BackupOutcome> {
  const newer = newerDocumentsReason(session)
  if (newer) return { ok: false, message: newer }
  const documents = CONFIGURATION_DOCUMENT_IDS.filter(
    (document) => session.info.documents[document].outcome === 'valid'
  )
  if (documents.length === 0) return { ok: true, value: undefined }
  onStart()
  const name = t('firmware.boardUpdate.backupName', {
    date: stamp(new Date()),
    version: session.info.firmwareVersion
  }).slice(0, MAXIMUM_CONFIGURATION_NAME)
  const saved = await library.save({ name, json: JSON.stringify(session.configuration) })
  if (!saved.ok) {
    return {
      ok: false,
      message: t('firmware.boardUpdate.backupFailed', { reason: saved.error.message })
    }
  }
  return {
    ok: true,
    value: {
      id: saved.value.id,
      name: saved.value.name,
      configuration: session.configuration,
      documents
    }
  }
}

function stamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
