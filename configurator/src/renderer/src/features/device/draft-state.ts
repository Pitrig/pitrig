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

/**
 * Everything several places need to know about the draft and the board under
 * it: whether it parses, whether it differs from what the board holds, and
 * whether it could be saved at all.
 *
 * It is one hook rather than one panel's local state because the answers are
 * now read in four places — the rail's modified dot, the canvas toolbar, the
 * Configs page, and the live-apply gate in App — and four copies of "is this
 * dirty" is four chances for them to disagree about it.
 */
export interface DraftState {
  /** The whole draft as a file or the library would hold it. */
  draftJson: string
  parsed: ValidationResult
  /** The draft differs from what the board has active or pending. */
  dirty: boolean
  /**
   * Which documents differ. The three are stored and sent separately, so this
   * is what a save writes, what a live apply sends, and what the Configs page
   * marks a row with — rather than three places each deciding for themselves.
   */
  dirtyDocuments: ConfigurationDocumentId[]
  connected: boolean
  /**
   * The board came up on the recovery surface: the serial link and the control
   * protocol alone. Saving is what gets it out of that, so a save stays
   * offered; live apply does not, because nothing is composed to apply to and
   * the board answers `unsupported`.
   */
  safeMode: boolean
  /** The draft names a different board than the one plugged in. */
  boardMismatch: boolean
  /** Families the dashboard names that the board does not hold yet. */
  missingFamilies: string[]
  /** Why "Save to board" is refused, or nothing when it is offered. */
  saveBlockedReason?: string
  /**
   * Whether the board could accept this document right now.
   *
   * A family the board lacks is the case worth naming: firmware rejects such a
   * document whole — apply_configuration.cpp answers `invalid_widget` with
   * `path=font` *before* it tears the running dashboard down — so sending it
   * would only turn a calm sentence into a red error. Firmware refuses the whole
   * document it arrives in, so while this is false no dashboard edit reaches the
   * board, not only the font.
   *
   * A board in safe mode is the other case: it composed nothing to apply to and
   * registers no apply handler, so every apply comes back `unsupported`.
   */
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

  // Structural comparison: reordering or reformatting properties no longer
  // makes an identical configuration look modified.
  const comparison = pendingConfiguration ?? activeConfiguration
  // Disconnected, every document counts as differing: there is nothing to
  // compare against, and the answer callers want is "all of it is unsaved".
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

/**
 * Validating the document and walking it for font families, memoized on the
 * identities that produce them.
 *
 * The cache is module-level rather than a `useMemo` per component because four
 * components ask this at once — the rail's dot, the canvas toolbar, the save
 * button and the live-apply gate — and a drag commits a fresh document per
 * animation frame. Per-component memoization would validate a 64 KB document
 * four times a frame to reach four identical answers.
 *
 * One entry is enough: every caller in a render pass sees the same draft, and
 * the next draft makes the previous answer worthless anyway.
 */
let memo:
  | {
      draft: DeviceConfiguration | undefined
      rawDraft: string | undefined
      hasLocalDraft: boolean
      installed: readonly string[] | undefined
      value: { parsed: ValidationResult; missingFamilies: string[] }
    }
  | undefined

/**
 * Which documents differ, memoized on the two configurations that produce the
 * answer.
 *
 * Same reason as `inspect` below, and the same shape: comparing documents
 * canonicalizes each one, which for the dashboard is a recursive key-sort of the
 * whole thing. A drag would otherwise pay for that several times per frame to
 * reach an answer that has not changed.
 */
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
  // A raw draft that never parsed leaves `draft` at the last good document, so
  // report the text problem rather than validating a stale structure.
  if (rawDraft !== undefined && parseConfiguration(rawDraft) === undefined) {
    return { ok: false, error: 'Configuration is not valid JSON.' }
  }
  if (!draft) return { ok: false, error: 'No local configuration.' }
  return validateConfigurationDocument(draft, { supportedBoards: SIMCORE_BOARD_IDS })
}
