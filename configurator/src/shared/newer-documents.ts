import type { ConfigurationDocumentId } from './configuration-schema'
import type { DeviceSession } from './device'
import { t } from './ui-text'

export function documentNames(documents: readonly ConfigurationDocumentId[]): string {
  return documents.map((document) => t(`documents.labelLower.${document}`)).join(', ')
}

export function newerDocumentsReason(session: DeviceSession | undefined): string | undefined {
  const documents = session?.newerDocuments ?? []
  if (documents.length === 0) return undefined
  return t('device.newerBoard.refused', { documents: documentNames(documents) })
}
