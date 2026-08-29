import { create } from 'zustand'

import { configurationsEqual, withWidgetIds } from '@shared/configuration-access'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import { mergeDocument } from '@shared/configuration-documents'
import type {
  DeviceConfiguration,
  DeviceConnection,
  DeviceError,
  DeviceInfo,
  DeviceScanProgress,
  DeviceSession,
  DeviceState,
  DeviceStatus,
  SimCoreBoardId
} from '@shared/device'

export interface RawDraft {
  document: ConfigurationDocumentId
  text: string
}

const MAXIMUM_HISTORY_ENTRIES = 100

type EditSource = 'structured' | 'raw'

interface DeviceStore {
  status: DeviceStatus
  session?: DeviceSession
  connection?: DeviceConnection
  scan?: DeviceScanProgress
  error?: DeviceError
  connectionRevision: number
  activeConfiguration?: DeviceConfiguration
  runningConfiguration?: DeviceConfiguration
  draft?: DeviceConfiguration
  rawDraft?: RawDraft
  hasLocalDraft: boolean
  draftFileName?: string
  offlineBoard?: SimCoreBoardId
  setOfflineBoard: (board?: SimCoreBoardId) => void
  rebootRequired: boolean
  past: DeviceConfiguration[]
  future: DeviceConfiguration[]
  editDepth: number
  editRecorded: boolean
  editSource: EditSource
  applyDeviceState: (state: DeviceState) => void
  setDraft: (configuration: DeviceConfiguration) => void
  setRawDraft: (document: ConfigurationDocumentId, text: string) => void
  replaceLocalDraft: (configuration: DeviceConfiguration, fileName?: string) => void
  reloadDraft: (session: DeviceSession) => void
  saveFeedback?: { kind: 'success' | 'error'; message: string }
  setSaveFeedback: (feedback?: { kind: 'success' | 'error'; message: string }) => void
  markConfigurationSaved: (configuration: DeviceConfiguration, applied: boolean) => void
  markConfigurationReset: (configuration: DeviceConfiguration) => void
  markLiveApplied: (configuration: DeviceConfiguration) => void
  beginEdit: () => void
  endEdit: () => void
  undo: () => void
  redo: () => void
}

function sameGenerations(left: DeviceInfo, right: DeviceInfo): boolean {
  return CONFIGURATION_DOCUMENT_IDS.every(
    (id) => left.documents[id].generation === right.documents[id].generation
  )
}

function adopt(configuration: DeviceConfiguration): DeviceConfiguration {
  return withWidgetIds(configuration)
}

function clearedHistory(): Partial<DeviceStore> {
  return { past: [], future: [], editDepth: 0, editRecorded: false }
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  status: 'disconnected',
  connectionRevision: 0,
  hasLocalDraft: false,
  rebootRequired: false,
  past: [],
  future: [],
  editDepth: 0,
  editRecorded: false,
  editSource: 'structured',
  applyDeviceState: (state) =>
    set((current) => {
      const link = { connection: state.connection, scan: state.scan, error: state.error }
      if (state.status !== 'connected' || !state.session) {
        return {
          ...link,
          status: state.status,
          session: undefined,
          activeConfiguration: undefined,
          runningConfiguration: undefined,
          rebootRequired: false
        }
      }

      const activeConfiguration = state.session.configuration
      const sameActiveConfiguration =
        current.status === 'connected' &&
        current.session?.info.boardId === state.session.info.boardId &&
        sameGenerations(current.session.info, state.session.info) &&
        configurationsEqual(current.activeConfiguration, activeConfiguration)

      if (sameActiveConfiguration) {
        return {
          ...link,
          status: state.status,
          session: state.session,
          rebootRequired:
            current.rebootRequired || (state.session.fontAssets?.rebootRequired ?? false)
        }
      }
      const freshConnection = current.status !== 'connected'
      return {
        ...link,
        status: state.status,
        session: state.session,
        connectionRevision: current.connectionRevision + (freshConnection ? 1 : 0),
        activeConfiguration,
        ...(freshConnection ? { runningConfiguration: activeConfiguration } : {}),
        ...(current.hasLocalDraft
          ? {}
          : {
              draft: adopt(activeConfiguration),
              rawDraft: undefined,
              hasLocalDraft: true,
              ...clearedHistory()
            }),
        rebootRequired: state.session.fontAssets?.rebootRequired ?? false
      }
    }),
  setDraft: (draft) =>
    set((current) => ({
      draft,
      rawDraft: undefined,
      hasLocalDraft: true,
      editSource: 'structured',
      ...recordHistory(current, 'structured')
    })),
  setRawDraft: (document, text) =>
    set((current) => {
      const parsed = parseConfiguration(text)
      if (!parsed || !current.draft) return { rawDraft: { document, text }, hasLocalDraft: true }
      return {
        rawDraft: { document, text },
        draft: mergeDocument(current.draft, document, parsed),
        hasLocalDraft: true,
        editSource: 'raw',
        ...recordHistory(current, 'raw')
      }
    }),
  replaceLocalDraft: (configuration, draftFileName) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName,
      ...clearedHistory()
    }),
  reloadDraft: (session) =>
    set((current) => ({
      session,
      activeConfiguration: session.configuration,
      draft: adopt(session.configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      rebootRequired: current.rebootRequired || (session.fontAssets?.rebootRequired ?? false),
      ...clearedHistory()
    })),
  setOfflineBoard: (offlineBoard) => set({ offlineBoard }),
  setSaveFeedback: (saveFeedback) => set({ saveFeedback }),
  markConfigurationSaved: (configuration, applied) =>
    set((current) => ({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      activeConfiguration: configuration,
      runningConfiguration: applied ? configuration : current.runningConfiguration,
      rebootRequired: false,
      ...clearedHistory()
    })),
  markConfigurationReset: (configuration) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      activeConfiguration: configuration,
      rebootRequired: true,
      ...clearedHistory()
    }),
  markLiveApplied: (configuration) => set({ runningConfiguration: configuration }),
  beginEdit: () =>
    set((current) => ({ editDepth: current.editDepth + 1, editRecorded: false })),
  endEdit: () => set((current) => ({ editDepth: Math.max(0, current.editDepth - 1) })),
  undo: () =>
    set((current) => {
      const previous = current.past.at(-1)
      if (previous === undefined || current.draft === undefined) return {}
      return {
        draft: previous,
        rawDraft: undefined,
        hasLocalDraft: true,
        past: current.past.slice(0, -1),
        future: [current.draft, ...current.future]
      }
    }),
  redo: () =>
    set((current) => {
      const [next, ...rest] = current.future
      if (next === undefined || current.draft === undefined) return {}
      return {
        draft: next,
        rawDraft: undefined,
        hasLocalDraft: true,
        past: [...current.past, current.draft],
        future: rest
      }
    })
}))

function recordHistory(
  current: DeviceStore,
  source: EditSource
): Partial<DeviceStore> {
  const grouped = current.editDepth > 0 && current.editRecorded
  const continuingRawSession = source === 'raw' && current.editSource === 'raw'
  if (current.draft === undefined || grouped || continuingRawSession) return {}
  return {
    past: [...current.past, current.draft].slice(-MAXIMUM_HISTORY_ENTRIES),
    future: [],
    editRecorded: true
  }
}

import { parseConfiguration } from './draft-text'

export {
  documentDraftText,
  draftText,
  formatConfiguration,
  parseConfiguration
} from './draft-text'
