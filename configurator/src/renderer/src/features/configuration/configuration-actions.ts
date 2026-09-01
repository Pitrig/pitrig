import { writeEventLog } from '@/lib/event-log'
import { bridgeErrorMessage, operationErrorMessage } from '@/features/device/bridge-errors'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import {
  CONFIGURATION_DOCUMENT_LABELS,
  documentOf,
  mergeDocument
} from '@shared/configuration-documents'
import {
  applyBoardTransportDefaults,
  BOARD_PROFILES,
  SIMCORE_BOARD_IDS,
  type DeviceConfiguration,
  type DeviceResult,
  type SimCoreBoardId
} from '@shared/device'
import {
  transferConfiguration,
  type LayoutFit,
  type LayoutTransferResult
} from '@shared/layout-transfer'
import { boardLabel, fitOutcome } from './board-labels'

export type ActionFeedback = { kind: 'success' | 'error'; message: string }

function adoptNewDocument(configuration: DeviceConfiguration, fileName?: string): void {
  useDeviceStore.getState().replaceLocalDraft(configuration, fileName)
  useDashboardEditorStore.getState().resetEditorState()
}

export function createConfiguration(board: SimCoreBoardId): ActionFeedback {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (
    hasLocalDraft &&
    !window.confirm('Discard the current local draft and create a new configuration?')
  ) {
    return { kind: 'error', message: 'Kept the current draft.' }
  }
  adoptNewDocument(applyBoardTransportDefaults({ board }))
  return { kind: 'success', message: `New ${board} configuration created locally.` }
}

export async function openConfigurationFile(): Promise<ActionFeedback | undefined> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !window.confirm('Discard the current local draft and open a JSON file?')) {
    return undefined
  }
  try {
    const result = await window.simcore.loadConfigurationFile()
    writeEventLog('Configuration file load completed', result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    if (!result.value) return undefined
    adoptNewDocument(result.value.configuration, result.value.fileName)
    return { kind: 'success', message: `${result.value.fileName} loaded.` }
  } catch (error) {
    return { kind: 'error', message: bridgeErrorMessage(error) }
  }
}

export async function saveConfigurationFile(): Promise<ActionFeedback | undefined> {
  const { draft } = useDeviceStore.getState()
  if (!draft) return { kind: 'error', message: 'There is no configuration to save.' }
  try {
    const result = await window.simcore.saveConfigurationFile({
      json: formatConfiguration(draft)
    })
    writeEventLog('Configuration file save completed', result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    if (!result.value.saved) return undefined
    adoptNewDocument(draft, result.value.fileName)
    return { kind: 'success', message: `${result.value.fileName ?? 'Configuration'} saved.` }
  } catch (error) {
    return { kind: 'error', message: bridgeErrorMessage(error) }
  }
}

export async function openSavedConfiguration(id: string): Promise<ActionFeedback> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !window.confirm(`Discard the current local draft and open "${id}"?`)) {
    return { kind: 'error', message: 'Kept the current draft.' }
  }
  const result = await window.simcore.readSavedConfiguration({ id })
  if (!result.ok) return { kind: 'error', message: result.error.message }
  adoptNewDocument(result.value.configuration, `${result.value.name}.json`)
  return { kind: 'success', message: `${result.value.name} opened.` }
}

export async function openRecentConfiguration(path: string): Promise<ActionFeedback> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !window.confirm('Discard the current local draft and open this file?')) {
    return { kind: 'error', message: 'Kept the current draft.' }
  }
  const result = await window.simcore.readRecentConfiguration({ path })
  if (!result.ok) return { kind: 'error', message: result.error.message }
  adoptNewDocument(result.value.configuration, result.value.fileName)
  return { kind: 'success', message: `${result.value.fileName} opened.` }
}

export function convertDraftToBoard(
  target: SimCoreBoardId,
  fit: LayoutFit,
  display?: { width: number; height: number }
): { feedback?: ActionFeedback; report?: LayoutTransferResult } {
  const { draft, setDraft } = useDeviceStore.getState()
  if (!draft) return { feedback: { kind: 'error', message: 'There is no draft to convert.' } }
  const from = BOARD_PROFILES[draft.board]?.display
  const to = display ?? BOARD_PROFILES[target].display ?? { width: 0, height: 0 }
  if (!from) return { feedback: { kind: 'error', message: 'The draft names an unknown board.' } }
  const destination =
    to.width === 0 || to.height === 0 ? 'a board with no display' : `${to.width} × ${to.height}`
  if (
    !window.confirm(
      `Convert the draft from ${from.width} × ${from.height} to ${destination}? ${fitOutcome(from, to, fit)}`
    )
  ) {
    return {}
  }

  const transferred = transferConfiguration(draft, { board: target, display, fit })
  const validated = validateConfigurationDocument(
    applyBoardTransportDefaults(transferred.configuration),
    { supportedBoards: SIMCORE_BOARD_IDS }
  )
  if (!validated.ok) {
    return {
      report: transferred,
      feedback: {
        kind: 'error',
        message: `The converted layout would not be accepted, so the draft was left alone. ${validated.error}`
      }
    }
  }
  setDraft(validated.configuration)
  return {
    report: transferred,
    feedback: { kind: 'success', message: `Converted to ${boardLabel(target)}.` }
  }
}

export async function readConfigurationFromBoard(): Promise<ActionFeedback> {
  return run('read', () => window.simcore.readDeviceConfiguration(), (state) => {
    if (state.session) {
      useDeviceStore.getState().reloadDraft(state.session)
      useDashboardEditorStore.getState().resetEditorState()
    }
    return 'Active configuration read from the board.'
  })
}

export async function resetBoardConfiguration(): Promise<ActionFeedback | undefined> {
  if (!window.confirm('Reset the saved configuration to the board-only factory configuration?')) {
    return undefined
  }
  return run('reset', () => window.simcore.resetDeviceConfiguration(), (result) => {
    useDeviceStore.getState().markConfigurationReset(result.configuration)
    return 'Factory configuration saved. Restart the board to activate it.'
  })
}

export async function resetBoardDocument(
  document: ConfigurationDocumentId
): Promise<ActionFeedback | undefined> {
  const label = CONFIGURATION_DOCUMENT_LABELS[document].toLowerCase()
  if (!window.confirm(`Erase the saved ${label} configuration from the board?`)) {
    return undefined
  }
  return run(
    `reset ${document}`,
    () => window.simcore.resetDeviceConfiguration({ document }),
    (result) => {
      useDeviceStore.getState().markConfigurationReset(result.configuration)
      return `Saved ${label} configuration erased. Restart the board to activate the factory one.`
    }
  )
}

export function loadDocumentFromBoard(
  document: ConfigurationDocumentId
): ActionFeedback | undefined {
  const store = useDeviceStore.getState()
  const board = store.activeConfiguration
  const draft = store.draft
  if (!board || !draft) {
    return { kind: 'error', message: 'The board has not reported a configuration yet.' }
  }
  store.setDraft(mergeDocument(draft, document, documentOf(board, document)))
  return {
    kind: 'success',
    message: `Loaded the ${CONFIGURATION_DOCUMENT_LABELS[document].toLowerCase()} configuration from the board.`
  }
}

export async function restartBoard(): Promise<ActionFeedback | undefined> {
  if (!window.confirm('Restart the connected SimCore board now?')) return undefined
  return run('reboot', () => window.simcore.rebootDevice(), () => 'Board is restarting.')
}

async function run<T>(
  operation: string,
  action: () => Promise<DeviceResult<T>>,
  onSuccess: (value: T) => string
): Promise<ActionFeedback> {
  try {
    const result = await action()
    writeEventLog(`Configuration ${operation} completed`, result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    return { kind: 'success', message: onSuccess(result.value) }
  } catch (error) {
    const message = operationErrorMessage(error)
    writeEventLog(`Configuration ${operation} failed`, { message })
    return { kind: 'error', message }
  }
}
