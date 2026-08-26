import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import { documentOf } from '@shared/configuration-documents'
import type { DeviceConfiguration } from '@shared/device'
import type { RawDraft } from './device-store'

export function formatConfiguration(configuration: DeviceConfiguration): string {
  return JSON.stringify(configuration, null, 2)
}

export function documentDraftText(
  state: { rawDraft?: RawDraft; draft?: DeviceConfiguration },
  document: ConfigurationDocumentId
): string {
  if (state.rawDraft?.document === document) return state.rawDraft.text
  return state.draft ? formatConfiguration(documentOf(state.draft, document)) : ''
}

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
