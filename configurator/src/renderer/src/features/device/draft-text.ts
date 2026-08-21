import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import { documentOf } from '@shared/configuration-documents'
import type { DeviceConfiguration } from '@shared/device'
import type { RawDraft } from './device-store'

// Reading a draft as text: the JSON the advanced editor shows and the parse
// that takes typed text back. Pure helpers over the store's own types.
export function formatConfiguration(configuration: DeviceConfiguration): string {
  return JSON.stringify(configuration, null, 2)
}

/**
 * Text the advanced JSON editor should show for one document.
 *
 * The typed text wins only for the document it was typed into: the other two
 * are rendered from the structured draft, which is where every other reader of
 * the configuration looks.
 */
export function documentDraftText(
  state: { rawDraft?: RawDraft; draft?: DeviceConfiguration },
  document: ConfigurationDocumentId
): string {
  if (state.rawDraft?.document === document) return state.rawDraft.text
  return state.draft ? formatConfiguration(documentOf(state.draft, document)) : ''
}

/** The whole draft as the file and the library hold it. */
export function draftText(state: { draft?: DeviceConfiguration }): string {
  return state.draft ? formatConfiguration(state.draft) : ''
}

export function parseConfiguration(text: string): DeviceConfiguration | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as DeviceConfiguration)
      : undefined
  } catch {
    return undefined
  }
}
