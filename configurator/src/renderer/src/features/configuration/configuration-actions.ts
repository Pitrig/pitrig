import { writeEventLog } from '@/lib/event-log'
import { t } from '@shared/ui-text'
import { bridgeErrorMessage, operationErrorMessage } from '@/features/device/bridge-errors'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import {
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
    !window.confirm(t('dashboard.configurationActions.discardTheCurrentLocalDraft'))
  ) {
    return { kind: 'error', message: t('dashboard.configurationActions.keptTheCurrentDraft') }
  }
  adoptNewDocument(applyBoardTransportDefaults({ board }))
  return { kind: 'success', message: t('dashboard.configurationActions.newBoardConfigurationCreatedLocally', { board: board }) }
}

export async function openConfigurationFile(): Promise<ActionFeedback | undefined> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !window.confirm(t('dashboard.configurationActions.discardTheCurrentLocalDraft2'))) {
    return undefined
  }
  try {
    const result = await window.simcore.loadConfigurationFile()
    writeEventLog('Configuration file load completed', result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    if (!result.value) return undefined
    adoptNewDocument(result.value.configuration, result.value.fileName)
    return { kind: 'success', message: t('dashboard.configurationActions.fileNameLoaded', { fileName: result.value.fileName }) }
  } catch (error) {
    return { kind: 'error', message: bridgeErrorMessage(error) }
  }
}

export async function saveConfigurationFile(): Promise<ActionFeedback | undefined> {
  const { draft } = useDeviceStore.getState()
  if (!draft) return { kind: 'error', message: t('dashboard.configurationActions.thereIsNoConfigurationTo') }
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
  if (hasLocalDraft && !window.confirm(t('dashboard.configurationActions.discardTheCurrentLocalDraft3', { id: id }))) {
    return { kind: 'error', message: t('dashboard.configurationActions.keptTheCurrentDraft') }
  }
  const result = await window.simcore.readSavedConfiguration({ id })
  if (!result.ok) return { kind: 'error', message: result.error.message }
  adoptNewDocument(result.value.configuration, `${result.value.name}.json`)
  return { kind: 'success', message: t('dashboard.configurationActions.nameOpened', { name: result.value.name }) }
}

export async function openRecentConfiguration(path: string): Promise<ActionFeedback> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !window.confirm(t('dashboard.configurationActions.discardTheCurrentLocalDraft4'))) {
    return { kind: 'error', message: t('dashboard.configurationActions.keptTheCurrentDraft') }
  }
  const result = await window.simcore.readRecentConfiguration({ path })
  if (!result.ok) return { kind: 'error', message: result.error.message }
  adoptNewDocument(result.value.configuration, result.value.fileName)
  return { kind: 'success', message: t('dashboard.configurationActions.fileNameOpened', { fileName: result.value.fileName }) }
}

export function convertDraftToBoard(
  target: SimCoreBoardId,
  fit: LayoutFit,
  display?: { width: number; height: number }
): { feedback?: ActionFeedback; report?: LayoutTransferResult } {
  const { draft, setDraft } = useDeviceStore.getState()
  if (!draft) return { feedback: { kind: 'error', message: t('dashboard.configurationActions.thereIsNoDraftTo') } }
  const from = BOARD_PROFILES[draft.board]?.display
  const to = display ?? BOARD_PROFILES[target].display ?? { width: 0, height: 0 }
  if (!from) return { feedback: { kind: 'error', message: t('dashboard.configurationActions.theDraftNamesAnUnknown') } }
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
        message: t('dashboard.configurationActions.theConvertedLayoutWouldNot', { error: validated.error })
      }
    }
  }
  setDraft(validated.configuration)
  return {
    report: transferred,
    feedback: { kind: 'success', message: t('dashboard.configurationActions.convertedToTarget', { target: boardLabel(target) }) }
  }
}

export async function readConfigurationFromBoard(): Promise<ActionFeedback> {
  return run('read', () => window.simcore.readDeviceConfiguration(), (state) => {
    if (state.session) {
      useDeviceStore.getState().reloadDraft(state.session)
      useDashboardEditorStore.getState().resetEditorState()
    }
    return t('dashboard.configurationActions.activeConfigurationReadFromThe')
  })
}

export async function resetBoardConfiguration(): Promise<ActionFeedback | undefined> {
  if (!window.confirm(t('dashboard.configurationActions.resetTheSavedConfigurationTo'))) {
    return undefined
  }
  return run('reset', () => window.simcore.resetDeviceConfiguration(), (result) => {
    useDeviceStore.getState().markConfigurationReset(result.configuration)
    return t('dashboard.configurationActions.factoryConfigurationSavedRestartThe')
  })
}

export async function resetBoardDocument(
  document: ConfigurationDocumentId
): Promise<ActionFeedback | undefined> {
  const label = t(`documents.labelLower.${document}`)
  if (!window.confirm(t('dashboard.configurationActions.eraseTheSavedLabelConfiguration', { label: label }))) {
    return undefined
  }
  return run(
    `reset ${document}`,
    () => window.simcore.resetDeviceConfiguration({ document }),
    (result) => {
      useDeviceStore.getState().markConfigurationReset(result.configuration)
      return t('dashboard.configurationActions.savedLabelConfigurationErasedRestart', { label: label })
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
    return { kind: 'error', message: t('dashboard.configurationActions.theBoardHasNotReported') }
  }
  store.setDraft(mergeDocument(draft, document, documentOf(board, document)))
  return {
    kind: 'success',
    message: t('dashboard.configurationActions.loadedTheDocumentConfigurationFrom', { document: t(`documents.labelLower.${document}`) })
  }
}

export async function restartBoard(): Promise<ActionFeedback | undefined> {
  if (!window.confirm(t('dashboard.configurationActions.restartTheConnectedSimcoreBoard'))) return undefined
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
