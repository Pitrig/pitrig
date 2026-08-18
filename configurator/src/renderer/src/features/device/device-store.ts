import { create } from 'zustand'

import { configurationsEqual, withWidgetIds } from '@shared/configuration-access'
import type {
  DeviceConfiguration,
  DeviceConnection,
  DeviceError,
  DeviceScanProgress,
  DeviceSession,
  DeviceState,
  DeviceStatus
} from '@shared/device'

// The draft is a structured document, not a string. Editing, comparison, and
// the preview all read `draft`; the serialized form exists only for the
// advanced JSON editor and for the wire. `rawDraft` holds the advanced editor's
// text while it differs from the structured draft, including while it is not
// parseable — the preview keeps rendering the last good document, as before.
//
// History lives here rather than in the editor because this is where every
// document replacement lands. Entries are whole documents: each edit already
// produces a fresh clone, so a snapshot costs a reference rather than a copy,
// and a 64 KB bound on the document keeps the stack small.

const MAXIMUM_HISTORY_ENTRIES = 100

/**
 * Which control produced the current draft. A raw-JSON session records one
 * entry when it starts rather than one per keystroke, which is what makes undo
 * step over an editing session instead of a character.
 */
type EditSource = 'structured' | 'raw'

interface DeviceStore {
  status: DeviceStatus
  session?: DeviceSession
  // The link's own report, mirrored here rather than kept beside the store in
  // a component: it is the same DeviceState every other field comes from, and
  // two copies of it drifted apart as soon as one of them was updated first.
  connection?: DeviceConnection
  scan?: DeviceScanProgress
  error?: DeviceError
  connectionRevision: number
  activeConfiguration?: DeviceConfiguration
  draft?: DeviceConfiguration
  rawDraft?: string
  hasLocalDraft: boolean
  draftFileName?: string
  pendingConfiguration?: DeviceConfiguration
  rebootRequired: boolean
  past: DeviceConfiguration[]
  future: DeviceConfiguration[]
  editDepth: number
  editRecorded: boolean
  editSource: EditSource
  applyDeviceState: (state: DeviceState) => void
  setDraft: (configuration: DeviceConfiguration) => void
  setRawDraft: (text: string) => void
  replaceLocalDraft: (configuration: DeviceConfiguration, fileName?: string) => void
  reloadDraft: (session: DeviceSession) => void
  markConfigurationSaved: (configuration: DeviceConfiguration) => void
  markConfigurationReset: (configuration: DeviceConfiguration) => void
  /**
   * Collapses everything until the matching `endEdit` into one history entry.
   * A drag commits a document per animation frame and a held arrow key one per
   * repeat; both are one edit to the person doing them.
   */
  beginEdit: () => void
  endEdit: () => void
  undo: () => void
  redo: () => void
}

function adopt(configuration: DeviceConfiguration): DeviceConfiguration {
  return withWidgetIds(configuration)
}

/**
 * A document arriving from outside the editor — a file, the board, a save —
 * is a new starting point, so the stack it would have been compared against no
 * longer describes anything the person can return to.
 */
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
      // Carried into every branch below. Leaving it out of one of them is
      // exactly how a stale port name or a cleared error survives a reconnect.
      const link = { connection: state.connection, scan: state.scan, error: state.error }
      if (state.status !== 'connected' || !state.session) {
        return {
          ...link,
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
          ...link,
          status: state.status,
          session: state.session,
          rebootRequired:
            current.rebootRequired || (state.session.fontAssets?.rebootRequired ?? false)
        }
      }
      return {
        ...link,
        status: state.status,
        session: state.session,
        connectionRevision:
          current.connectionRevision + (current.status === 'connected' ? 0 : 1),
        activeConfiguration,
        ...(current.hasLocalDraft
          ? {}
          : {
              draft: adopt(activeConfiguration),
              rawDraft: undefined,
              hasLocalDraft: true,
              ...clearedHistory()
            }),
        pendingConfiguration: undefined,
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
  // Keeps the typed text exactly as entered so reformatting never fights the
  // caret; the structured draft advances only while the text parses.
  setRawDraft: (text) =>
    set((current) => {
      const parsed = parseConfiguration(text)
      if (!parsed) return { rawDraft: text, hasLocalDraft: true }
      return {
        rawDraft: text,
        draft: parsed,
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
  markConfigurationSaved: (configuration) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      pendingConfiguration: configuration,
      rebootRequired: true,
      ...clearedHistory()
    }),
  markConfigurationReset: (configuration) =>
    set({
      draft: adopt(configuration),
      rawDraft: undefined,
      hasLocalDraft: true,
      draftFileName: undefined,
      pendingConfiguration: configuration,
      rebootRequired: true,
      ...clearedHistory()
    }),
  beginEdit: () =>
    set((current) => ({ editDepth: current.editDepth + 1, editRecorded: false })),
  endEdit: () => set((current) => ({ editDepth: Math.max(0, current.editDepth - 1) })),
  undo: () =>
    set((current) => {
      const previous = current.past.at(-1)
      if (previous === undefined || current.draft === undefined) return {}
      return {
        draft: previous,
        // The advanced editor's text belonged to the document being undone.
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

/**
 * The history half of a draft replacement. Nothing is recorded until there is a
 * document to go back to, an open edit group records only its first change, and
 * a raw-JSON session records only where it began.
 */
function recordHistory(
  current: DeviceStore,
  source: EditSource
): Partial<DeviceStore> {
  const grouped = current.editDepth > 0 && current.editRecorded
  const continuingRawSession = source === 'raw' && current.editSource === 'raw'
  if (current.draft === undefined || grouped || continuingRawSession) return {}
  return {
    past: [...current.past, current.draft].slice(-MAXIMUM_HISTORY_ENTRIES),
    // Editing after undoing abandons the branch that was undone.
    future: [],
    editRecorded: true
  }
}

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
