import { create } from 'zustand'

import { configurationsEqual, withWidgetIds } from '../../../../shared/configuration-access'
import type {
  DeviceConfiguration,
  DeviceSession,
  DeviceState,
  DeviceStatus
} from '../../../../shared/device'

// The draft is a structured document, not a string. Editing, comparison, and
// the preview all read `draft`; the serialized form exists only for the
// advanced JSON editor and for the wire. `rawDraft` holds the advanced editor's
// text while it differs from the structured draft, including while it is not
// parseable — the preview keeps rendering the last good document, as before.

interface DeviceStore {
  status: DeviceStatus
  session?: DeviceSession
  connectionRevision: number
  activeConfiguration?: DeviceConfiguration
  draft?: DeviceConfiguration
  rawDraft?: string
  hasLocalDraft: boolean
  draftFileName?: string
  pendingConfiguration?: DeviceConfiguration
  rebootRequired: boolean
  applyDeviceState: (state: DeviceState) => void
  setDraft: (configuration: DeviceConfiguration) => void
  setRawDraft: (text: string) => void
  replaceLocalDraft: (configuration: DeviceConfiguration, fileName?: string) => void
  reloadDraft: (session: DeviceSession) => void
  markConfigurationSaved: (configuration: DeviceConfiguration) => void
  markConfigurationReset: (configuration: DeviceConfiguration) => void
}

function adopt(configuration: DeviceConfiguration): DeviceConfiguration {
  return withWidgetIds(configuration)
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  status: 'disconnected',
  connectionRevision: 0,
  hasLocalDraft: false,
  rebootRequired: false,
  applyDeviceState: (state) =>
    set((current) => {
      if (state.status !== 'connected' || !state.session) {
        return {
          status: state.status,
          session: undefined,
          activeConfiguration: undefined,
          pendingConfiguration: undefined,
          rebootRequired: false
        }
      }

      const activeConfiguration = state.session.configuration
      const sameActiveConfiguration =
        current.status === 'connected' &&
        current.session?.info.boardId === state.session.info.boardId &&
        current.session.info.generation === state.session.info.generation &&
        configurationsEqual(current.activeConfiguration, activeConfiguration)

      if (sameActiveConfiguration) {
        return {
          status: state.status,
          session: state.session,
          rebootRequired:
            current.rebootRequired || (state.session.fontAssets?.rebootRequired ?? false)
        }
      }
      return {
        status: state.status,
        session: state.session,
        connectionRevision:
          current.connectionRevision + (current.status === 'connected' ? 0 : 1),
        activeConfiguration,
        ...(current.hasLocalDraft
          ? {}
          : { draft: adopt(activeConfiguration), rawDraft: undefined, hasLocalDraft: true }),
        pendingConfiguration: undefined,
        rebootRequired: state.session.fontAssets?.rebootRequired ?? false
      }
    }),
  setDraft: (draft) => set({ draft, rawDraft: undefined, hasLocalDraft: true }),
  // Keeps the typed text exactly as entered so reformatting never fights the
  // caret; the structured draft advances only while the text parses.
  setRawDraft: (text) =>
    set(() => {
      const parsed = parseConfiguration(text)
      return parsed
        ? { rawDraft: text, draft: parsed, hasLocalDraft: true }
        : { rawDraft: text, hasLocalDraft: true }
    }),
  replaceLocalDraft: (configuration, draftFileName) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName
    }),
  reloadDraft: (session) =>
    set((current) => ({
      session,
      activeConfiguration: session.configuration,
      draft: adopt(session.configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      rebootRequired: current.rebootRequired || (session.fontAssets?.rebootRequired ?? false)
    })),
  markConfigurationSaved: (configuration) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      pendingConfiguration: configuration,
      rebootRequired: true
    }),
  markConfigurationReset: (configuration) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      pendingConfiguration: configuration,
      rebootRequired: true
    })
}))

export function formatConfiguration(configuration: DeviceConfiguration): string {
  return JSON.stringify(configuration, null, 2)
}

/** Text the advanced JSON editor should show for the current draft. */
export function draftText(state: {
  rawDraft?: string
  draft?: DeviceConfiguration
}): string {
  if (state.rawDraft !== undefined) return state.rawDraft
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
