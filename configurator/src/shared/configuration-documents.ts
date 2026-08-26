import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ApplicationConfiguration,
  type ConfigurationDocumentId
} from './configuration-schema'
import { canonicalJson } from './configuration-access'

export const CONFIGURATION_DOCUMENT_LABELS: Record<ConfigurationDocumentId, string> = {
  dashboard: 'Dashboard',
  modules: 'Modules',
  protocol: 'Protocol'
}

export const CONFIGURATION_DOCUMENT_SUMMARIES: Record<ConfigurationDocumentId, string> = {
  dashboard: 'Screens and the widgets on them.',
  modules: 'Peripherals beyond the display.',
  protocol: 'The link that carries telemetry.'
}

export function documentOf(
  configuration: ApplicationConfiguration,
  id: ConfigurationDocumentId
): ApplicationConfiguration {
  const source = configuration as unknown as Record<string, unknown>
  const document: Record<string, unknown> = { board: configuration.board }
  for (const section of CONFIGURATION_DOCUMENTS[id].sections) {
    if (source[section] !== undefined) document[section] = source[section]
  }
  return document as unknown as ApplicationConfiguration
}

export function documentJson(
  configuration: ApplicationConfiguration,
  id: ConfigurationDocumentId
): string {
  return JSON.stringify(documentOf(configuration, id))
}

export function documentPayloadBytes(
  configuration: ApplicationConfiguration,
  id: ConfigurationDocumentId
): number {
  return new TextEncoder().encode(documentJson(configuration, id)).length
}

export function mergeDocument(
  configuration: ApplicationConfiguration,
  id: ConfigurationDocumentId,
  document: ApplicationConfiguration
): ApplicationConfiguration {
  const source = document as unknown as Record<string, unknown>
  const merged = { ...configuration, board: document.board } as unknown as Record<string, unknown>
  for (const section of CONFIGURATION_DOCUMENTS[id].sections) {
    if (source[section] === undefined) delete merged[section]
    else merged[section] = source[section]
  }
  return merged as unknown as ApplicationConfiguration
}

export function mergeDocuments(
  documents: Record<ConfigurationDocumentId, ApplicationConfiguration>
): ApplicationConfiguration {
  let merged = { board: documents.dashboard.board } as ApplicationConfiguration
  for (const id of CONFIGURATION_DOCUMENT_IDS) {
    merged = mergeDocument(merged, id, documents[id])
  }
  return merged
}

export function documentsDiffering(
  draft: ApplicationConfiguration | undefined,
  board: ApplicationConfiguration | undefined
): ConfigurationDocumentId[] {
  if (!draft) return []
  if (!board) return [...CONFIGURATION_DOCUMENT_IDS]
  return CONFIGURATION_DOCUMENT_IDS.filter(
    (id) => canonicalJson(documentOf(draft, id)) !== canonicalJson(documentOf(board, id))
  )
}

export function isConfigurationDocumentId(value: string): value is ConfigurationDocumentId {
  return (CONFIGURATION_DOCUMENT_IDS as readonly string[]).includes(value)
}
