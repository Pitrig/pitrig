import { documentsDiffering } from '@shared/configuration-documents'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import {
  validateConfigurationDocument,
  type ValidationResult
} from '@shared/configuration-validate'
import { SIMCORE_BOARD_IDS, type DeviceConfiguration } from '@shared/device'
import {
  collectFontRequirements,
  missingFontFamilies
} from '@/features/font-library/font-requirements'
import { draftText, parseConfiguration, useDeviceStore } from './device-store'

export interface DraftState {
  draftJson: string
  parsed: ValidationResult
  dirty: boolean
  dirtyDocuments: ConfigurationDocumentId[]
  unappliedDocuments: ConfigurationDocumentId[]
  boardShowsDraft: boolean
  connected: boolean
  safeMode: boolean
  boardMismatch: boolean
  missingFamilies: string[]
  saveBlockedReason?: string
  liveApplyBlockedReason?: string
  liveApplyAllowed: boolean
}

export function useDraftState(): DraftState {
  const session = useDeviceStore((state) => state.session)
  const status = useDeviceStore((state) => state.status)
  const draft = useDeviceStore((state) => state.draft)
  const rawDraft = useDeviceStore((state) => state.rawDraft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const runningConfiguration = useDeviceStore((state) => state.runningConfiguration)

  const draftJson = draftText({ draft })
  const { parsed, missingFamilies } = inspect(
    draft,
    rawDraft?.text,
    hasLocalDraft,
    session?.fontAssets?.families
  )

  const compared = hasLocalDraft ? draft : undefined
  const dirtyDocuments = compare(compared, session ? activeConfiguration : undefined)
  const unappliedDocuments = compare(compared, session ? runningConfiguration : undefined)
  const dirty = dirtyDocuments.length > 0
  const connected = status === 'connected' && Boolean(session)
  const safeMode = session?.info.health?.safeMode ?? false
  const boardMismatch =
    parsed.ok && session ? parsed.configuration.board !== session.info.boardId : false

  const saveBlockedReason = !connected
    ? 'Connect a SimCore board before saving.'
    : boardMismatch
      ? `Local configuration targets ${parsed.ok ? parsed.configuration.board : 'another board'}, but the connected board is ${session?.info.boardId}. Convert the draft to move the layout across.`
      : !parsed.ok
        ? parsed.error
        : !session?.info.storageAvailable
          ? 'Persistent configuration storage is unavailable on this board.'
          : !dirty
            ? 'The draft already matches what the board holds.'
            : undefined

  const liveApplyBlockedReason = liveApplyBlocker({
    connected,
    safeMode,
    parsed,
    boardMismatch,
    boardId: session?.info.boardId,
    missingFamilies
  })

  return {
    draftJson,
    parsed,
    dirty,
    dirtyDocuments,
    unappliedDocuments,
    boardShowsDraft: connected && unappliedDocuments.length === 0,
    connected,
    safeMode,
    boardMismatch,
    missingFamilies,
    saveBlockedReason,
    liveApplyBlockedReason,
    liveApplyAllowed: liveApplyBlockedReason === undefined
  }
}

let memo:
  | {
      draft: DeviceConfiguration | undefined
      rawDraft: string | undefined
      hasLocalDraft: boolean
      installed: readonly string[] | undefined
      value: { parsed: ValidationResult; missingFamilies: string[] }
    }
  | undefined

interface DiffMemo {
  draft: DeviceConfiguration | undefined
  board: DeviceConfiguration | undefined
  value: ConfigurationDocumentId[]
}

const diffMemos: DiffMemo[] = []

function liveApplyBlocker(state: {
  connected: boolean
  safeMode: boolean
  parsed: ValidationResult
  boardMismatch: boolean
  boardId?: string
  missingFamilies: string[]
}): string | undefined {
  if (!state.connected) return 'Connect a SimCore board to mirror the draft on it.'
  if (state.safeMode) {
    return 'The board is in safe mode. It draws nothing until it is repaired and restarted.'
  }
  if (!state.parsed.ok) {
    return `The draft is not valid, so the board keeps what it runs. ${state.parsed.error}`
  }
  if (state.boardMismatch) {
    return `The draft targets ${state.parsed.configuration.board}, the board is ${state.boardId}.`
  }
  if (state.missingFamilies.length > 0) {
    return `The board lacks ${state.missingFamilies.join(', ')}. Saving installs the fonts.`
  }
  return undefined
}

function compare(
  draft: DeviceConfiguration | undefined,
  board: DeviceConfiguration | undefined
): ConfigurationDocumentId[] {
  const hit = diffMemos.find((entry) => entry.draft === draft && entry.board === board)
  if (hit) return hit.value
  const value = documentsDiffering(draft, board)
  diffMemos.unshift({ draft, board, value })
  diffMemos.length = Math.min(diffMemos.length, 2)
  return value
}

function inspect(
  draft: DeviceConfiguration | undefined,
  rawDraft: string | undefined,
  hasLocalDraft: boolean,
  installed: readonly string[] | undefined
): { parsed: ValidationResult; missingFamilies: string[] } {
  if (
    memo &&
    memo.draft === draft &&
    memo.rawDraft === rawDraft &&
    memo.hasLocalDraft === hasLocalDraft &&
    memo.installed === installed
  ) {
    return memo.value
  }
  const parsed = parseDraft(draft, rawDraft, hasLocalDraft)
  const value = {
    parsed,
    missingFamilies: missingFontFamilies(
      parsed.ok ? collectFontRequirements(parsed.configuration) : [],
      installed ?? []
    )
  }
  memo = { draft, rawDraft, hasLocalDraft, installed, value }
  return value
}

function parseDraft(
  draft: DeviceConfiguration | undefined,
  rawDraft: string | undefined,
  hasLocalDraft: boolean
): ValidationResult {
  if (!hasLocalDraft) return { ok: false, error: 'No local configuration.' }
  if (rawDraft !== undefined && parseConfiguration(rawDraft) === undefined) {
    return { ok: false, error: 'Configuration is not valid JSON.' }
  }
  if (!draft) return { ok: false, error: 'No local configuration.' }
  return validateConfigurationDocument(draft, { supportedBoards: SIMCORE_BOARD_IDS })
}
