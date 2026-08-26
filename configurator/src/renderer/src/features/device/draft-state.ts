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
  connected: boolean
  safeMode: boolean
  boardMismatch: boolean
  missingFamilies: string[]
  saveBlockedReason?: string
  liveApplyAllowed: boolean
}

export function useDraftState(): DraftState {
  const session = useDeviceStore((state) => state.session)
  const status = useDeviceStore((state) => state.status)
  const draft = useDeviceStore((state) => state.draft)
  const rawDraft = useDeviceStore((state) => state.rawDraft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const pendingConfiguration = useDeviceStore((state) => state.pendingConfiguration)

  const draftJson = draftText({ draft })
  const { parsed, missingFamilies } = inspect(
    draft,
    rawDraft?.text,
    hasLocalDraft,
    session?.fontAssets?.families
  )

  const comparison = pendingConfiguration ?? activeConfiguration
  const dirtyDocuments = compare(
    hasLocalDraft ? draft : undefined,
    session ? comparison : undefined
  )
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
            ? 'The draft already matches the active or pending configuration.'
            : undefined

  return {
    draftJson,
    parsed,
    dirty,
    dirtyDocuments,
    connected,
    safeMode,
    boardMismatch,
    missingFamilies,
    saveBlockedReason,
    liveApplyAllowed:
      connected && !safeMode && parsed.ok && !boardMismatch && missingFamilies.length === 0
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

let diffMemo:
  | {
      draft: DeviceConfiguration | undefined
      board: DeviceConfiguration | undefined
      value: ConfigurationDocumentId[]
    }
  | undefined

function compare(
  draft: DeviceConfiguration | undefined,
  board: DeviceConfiguration | undefined
): ConfigurationDocumentId[] {
  if (diffMemo && diffMemo.draft === draft && diffMemo.board === board) {
    return diffMemo.value
  }
  const value = documentsDiffering(draft, board)
  diffMemo = { draft, board, value }
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
