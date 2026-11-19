import { documentsDiffering } from '@shared/configuration-documents'
import {
  CONFIGURATION_SCHEMA_VERSION,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'
import {
  validateConfigurationDocument,
  type ValidationResult
} from '@shared/configuration-validate'
import { PITRIG_BOARD_IDS, type DeviceConfiguration } from '@shared/device'
import { documentImageIds } from '@shared/document-assets'
import {
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  type ImageAssetState
} from '@shared/image-assets'
import {
  planImageDelivery,
  type ImageDeliveryPlan,
  type ImageLibrarySnapshot
} from '@shared/image-library'
import { useImageLibraryStore } from '@/features/image-assets/image-library-store'
import {
  collectFontRequirements,
  missingFontFamilies
} from '@/features/font-library/font-requirements'
import { useDeviceStore } from './device-store'
import { t } from '@shared/ui-text'

export interface DraftState {
  parsed: ValidationResult
  dirty: boolean
  dirtyDocuments: ConfigurationDocumentId[]
  unappliedDocuments: ConfigurationDocumentId[]
  boardShowsDraft: boolean
  connected: boolean
  safeMode: boolean
  boardMismatch: boolean
  missingFamilies: string[]
  imagePlan: ImageDeliveryPlan
  documentSaveBlockedReason?: string
  imageSaveBlockedReason?: string
  saveBlockedReason?: string
  liveApplyBlockedReason?: string
  liveApplyAllowed: boolean
}

export function useDraftState(): DraftState {
  const session = useDeviceStore((state) => state.session)
  const status = useDeviceStore((state) => state.status)
  const draft = useDeviceStore((state) => state.draft)
  const hasLocalDraft = useDeviceStore((state) => state.hasLocalDraft)
  const activeConfiguration = useDeviceStore((state) => state.activeConfiguration)
  const runningConfiguration = useDeviceStore((state) => state.runningConfiguration)
  const imageLibrary = useImageLibraryStore((state) => state.snapshot)

  const { parsed, missingFamilies } = inspect(draft, hasLocalDraft, session?.fontAssets?.families)

  const compared = hasLocalDraft ? draft : undefined
  const dirtyDocuments = compare(compared, session ? activeConfiguration : undefined)
  const unappliedDocuments = compare(compared, session ? runningConfiguration : undefined)
  const dirty = dirtyDocuments.length > 0
  const connected = status === 'connected' && Boolean(session)
  const safeMode = session?.info.health?.safeMode ?? false
  const boardMismatch =
    parsed.ok && session ? parsed.configuration.board !== session.info.boardId : false
  const outdated = session ? outdatedFirmware(session.info.schemaVersion) : undefined
  const imagePlan = planImages(
    parsed.ok ? parsed.configuration : undefined,
    imageLibrary,
    session?.imageAssets
  )
  const fontsPending = missingFamilies.length > 0 && Boolean(session?.fontAssets?.storageAvailable)
  const assetsPending = !safeMode && (fontsPending || imagePlan.install)
  const imageBlocker = connected && !safeMode ? imageBlockerReason(imagePlan) : undefined

  const documentSaveBlockedReason = !connected
    ? 'Connect a Pitrig board before saving.'
    : outdated
      ? outdated
      : boardMismatch
      ? `Local configuration targets ${parsed.ok ? parsed.configuration.board : 'another board'}, but the connected board is ${session?.info.boardId}. Convert the draft to move the layout across.`
      : !parsed.ok
        ? parsed.error
        : !session?.info.storageAvailable
          ? 'Persistent configuration storage is unavailable on this board.'
          : undefined
  const saveBlockedReason =
    documentSaveBlockedReason ??
    imageBlocker ??
    (!dirty && !assetsPending ? 'The draft already matches what the board holds.' : undefined)

  const liveApplyBlockedReason = outdated ?? liveApplyBlocker({
    connected,
    safeMode,
    parsed,
    boardMismatch,
    boardId: session?.info.boardId,
    missingFamilies,
    missingImages: imagePlan.missingOnBoard
  })

  return {
    parsed,
    dirty,
    dirtyDocuments,
    unappliedDocuments,
    boardShowsDraft: connected && unappliedDocuments.length === 0,
    connected,
    safeMode,
    boardMismatch,
    missingFamilies,
    imagePlan,
    documentSaveBlockedReason,
    imageSaveBlockedReason: imageBlocker,
    saveBlockedReason,
    liveApplyBlockedReason,
    liveApplyAllowed: liveApplyBlockedReason === undefined
  }
}

let memo:
  | {
      draft: DeviceConfiguration | undefined
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

export function outdatedFirmware(schema: number): string | undefined {
  if (schema === CONFIGURATION_SCHEMA_VERSION) return undefined
  return t('device.draftState.theBoardFirmwareReadsSchema', {
    schema,
    expected: CONFIGURATION_SCHEMA_VERSION
  })
}

function liveApplyBlocker(state: {
  connected: boolean
  safeMode: boolean
  parsed: ValidationResult
  boardMismatch: boolean
  boardId?: string
  missingFamilies: string[]
  missingImages: string[]
}): string | undefined {
  if (!state.connected) return t('device.draftState.connectAPitrigBoardTo')
  if (state.safeMode) {
    return t('device.draftState.theBoardIsInSafe')
  }
  if (!state.parsed.ok) {
    return t('device.draftState.theDraftIsNotValid', { error: state.parsed.error })
  }
  if (state.boardMismatch) {
    return t('device.draftState.theDraftTargetsBoardThe', { board: state.parsed.configuration.board, boardId: state.boardId ?? '' })
  }
  if (state.missingFamilies.length > 0) {
    return t('device.draftState.theBoardLacksJoinSaving', { join: state.missingFamilies.join(', ') })
  }
  if (state.missingImages.length > 0) {
    return t('device.draftState.theBoardLacksImages', { images: state.missingImages.join(', ') })
  }
  return undefined
}

let imageMemo:
  | {
      configuration: DeviceConfiguration | undefined
      library: ImageLibrarySnapshot
      board: ImageAssetState | undefined
      value: ImageDeliveryPlan
    }
  | undefined

function planImages(
  configuration: DeviceConfiguration | undefined,
  library: ImageLibrarySnapshot,
  board: ImageAssetState | undefined
): ImageDeliveryPlan {
  if (
    imageMemo &&
    imageMemo.configuration === configuration &&
    imageMemo.library === library &&
    imageMemo.board === board
  ) {
    return imageMemo.value
  }
  const value = planImageDelivery({
    needed: documentImageIds(configuration),
    library: library.entries,
    board,
    installed: library.installed
  })
  imageMemo = { configuration, library, board, value }
  return value
}

function imageBlockerReason(plan: ImageDeliveryPlan): string | undefined {
  switch (plan.blocker) {
    case 'unavailable':
      return t('save.imageDelivery.unavailable', { images: plan.unavailable.join(', ') })
    case 'board_only':
      return t('save.imageDelivery.boardOnly', {
        images: plan.notOnPc.join(', '),
        pending: [...plan.missingOnBoard, ...plan.differing].join(', ')
      })
    case 'too_many':
      return t('save.imageDelivery.tooMany', { count: plan.needed.length, maximum: MAXIMUM_IMAGES })
    case 'too_large':
      return t('save.imageDelivery.tooLarge', {
        size: Math.ceil(plan.packageSize / 1024),
        limit: Math.floor(MAXIMUM_IMAGE_PACKAGE_SIZE / 1024)
      })
    case 'no_storage':
      return t('save.imageDelivery.noStorage')
    default:
      return undefined
  }
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
  hasLocalDraft: boolean,
  installed: readonly string[] | undefined
): { parsed: ValidationResult; missingFamilies: string[] } {
  if (
    memo &&
    memo.draft === draft &&
    memo.hasLocalDraft === hasLocalDraft &&
    memo.installed === installed
  ) {
    return memo.value
  }
  const parsed = parseDraft(draft, hasLocalDraft)
  const value = {
    parsed,
    missingFamilies: missingFontFamilies(
      parsed.ok ? collectFontRequirements(parsed.configuration) : [],
      installed ?? []
    )
  }
  memo = { draft, hasLocalDraft, installed, value }
  return value
}

function parseDraft(
  draft: DeviceConfiguration | undefined,
  hasLocalDraft: boolean
): ValidationResult {
  if (!hasLocalDraft || !draft) {
    return { ok: false, error: t('device.draftState.noLocalConfiguration') }
  }
  return validateConfigurationDocument(draft, { supportedBoards: PITRIG_BOARD_IDS })
}
