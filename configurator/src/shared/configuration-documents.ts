import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ApplicationConfiguration,
  type ConfigurationDocumentId
} from './configuration-schema'
import { canonicalJson } from './configuration-access'

/**
 * The three documents the device stores and transfers, carved out of the one
 * aggregate configuration the editor holds.
 *
 * The split is at the edges rather than in the middle. A draft is still one
 * `ApplicationConfiguration` — the canvas, the inspector, undo and a saved file
 * all work on the whole thing — and these are what one `@SC:` command carries.
 * Keeping the aggregate is what lets a rule that spans sections (a UART pin the
 * board does not have, a font budget over every widget) still be one check.
 */

/** How a document is named where a person reads it. */
export const CONFIGURATION_DOCUMENT_LABELS: Record<ConfigurationDocumentId, string> = {
  dashboard: 'Dashboard',
  modules: 'Modules',
  protocol: 'Protocol'
}

/** One line on what each document holds, for the places that list all three. */
export const CONFIGURATION_DOCUMENT_SUMMARIES: Record<ConfigurationDocumentId, string> = {
  dashboard: 'Screens and the widgets on them.',
  modules: 'Peripherals beyond the display.',
  protocol: 'The link that carries telemetry.'
}

/**
 * The slice of one configuration that a document carries: the board identifier,
 * which every document needs to be answerable for arriving at the wrong board,
 * plus the sections belonging to it that are actually present.
 */
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

/** The exact bytes a document is sent as: compact, single-line, no spacing. */
export function documentJson(
  configuration: ApplicationConfiguration,
  id: ConfigurationDocumentId
): string {
  return JSON.stringify(documentOf(configuration, id))
}

/** What one document weighs on the wire, against the bound it is held to. */
export function documentPayloadBytes(
  configuration: ApplicationConfiguration,
  id: ConfigurationDocumentId
): number {
  return new TextEncoder().encode(documentJson(configuration, id)).length
}

/**
 * One document merged back into an aggregate, replacing every section it owns.
 * An omitted section is removed rather than left behind: the document is the
 * whole truth about the sections it carries, on the device and here alike.
 */
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

/** All three documents merged into the aggregate the editor works on. */
export function mergeDocuments(
  documents: Record<ConfigurationDocumentId, ApplicationConfiguration>
): ApplicationConfiguration {
  let merged = { board: documents.dashboard.board } as ApplicationConfiguration
  for (const id of CONFIGURATION_DOCUMENT_IDS) {
    merged = mergeDocument(merged, id, documents[id])
  }
  return merged
}

/**
 * Which documents differ between a draft and what the board holds — the unit a
 * save writes and a live apply sends. Comparison is structural, so reordering
 * or reformatting properties is not a difference, exactly as the whole-document
 * dirty check has always treated it.
 */
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

/** Whether a document is one this build knows, for text arriving from a device. */
export function isConfigurationDocumentId(value: string): value is ConfigurationDocumentId {
  return (CONFIGURATION_DOCUMENT_IDS as readonly string[]).includes(value)
}
