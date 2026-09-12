import { writeEventLog } from '@/lib/event-log'
import { t } from '@shared/ui-text'
import { bridgeErrorMessage, operationErrorMessage } from '@/features/device/bridge-errors'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { allWidgetsOf, screensOf } from '@shared/configuration-access'
import { validateConfigurationDocument } from '@shared/configuration-validate'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import {
  documentOf,
  mergeDocument
} from '@shared/configuration-documents'
import {
  applyBoardTransportDefaults,
  BOARD_PROFILES,
  PITRIG_BOARD_IDS,
  type DeviceConfiguration,
  type DeviceResult,
  type PitrigBoardId
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

export function createConfiguration(board: PitrigBoardId): ActionFeedback {
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
    const result = await window.pitrig.loadConfigurationFile()
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
    const result = await window.pitrig.saveConfigurationFile({
      json: formatConfiguration(draft)
    })
    writeEventLog('Configuration file save completed', result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    if (!result.value.saved) return undefined
    useDeviceStore.getState().setDraftFileName(result.value.fileName)
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
  const result = await window.pitrig.readSavedConfiguration({ id })
  if (!result.ok) return { kind: 'error', message: result.error.message }
  adoptNewDocument(result.value.configuration, `${result.value.name}.json`)
  return { kind: 'success', message: t('dashboard.configurationActions.nameOpened', { name: result.value.name }) }
}

export async function openRecentConfiguration(path: string): Promise<ActionFeedback> {
  const { hasLocalDraft } = useDeviceStore.getState()
  if (hasLocalDraft && !window.confirm(t('dashboard.configurationActions.discardTheCurrentLocalDraft4'))) {
    return { kind: 'error', message: t('dashboard.configurationActions.keptTheCurrentDraft') }
  }
  const result = await window.pitrig.readRecentConfiguration({ path })
  if (!result.ok) return { kind: 'error', message: result.error.message }
  adoptNewDocument(result.value.configuration, result.value.fileName)
  return { kind: 'success', message: t('dashboard.configurationActions.fileNameOpened', { fileName: result.value.fileName }) }
}

export function convertDraftToBoard(
  target: PitrigBoardId,
  fit: LayoutFit,
  display?: { width: number; height: number }
): { feedback?: ActionFeedback; report?: LayoutTransferResult } {
  const { draft, setDraft } = useDeviceStore.getState()
  if (!draft) return { feedback: { kind: 'error', message: t('dashboard.configurationActions.thereIsNoDraftTo') } }
  const profile = BOARD_PROFILES[draft.board]
  if (!profile) {
    return { feedback: { kind: 'error', message: t('dashboard.configurationActions.theDraftNamesAnUnknown') } }
  }
  const from = profile.display ?? NO_DISPLAY
  const to = display ?? BOARD_PROFILES[target].display ?? NO_DISPLAY
  if (
    !window.confirm(
      t('dashboard.configurationActions.convertTheDraftFromFrom', {
        from: sizeLabel(from),
        to: sizeLabel(to),
        outcome: fitOutcome(from, to, fit)
      })
    )
  ) {
    return {}
  }

  const transferred = transferConfiguration(draft, { board: target, display, fit })
  const converted = applyBoardTransportDefaults(transferred.configuration)
  const validated = validateConfigurationDocument(converted, { supportedBoards: PITRIG_BOARD_IDS })
  if (!validated.ok && !transferred.blocking) {
    return {
      report: transferred,
      feedback: {
        kind: 'error',
        message: t('dashboard.configurationActions.theConvertedLayoutWouldNot', { error: validated.error })
      }
    }
  }
  setDraft(validated.ok ? validated.configuration : converted)
  return {
    report: transferred,
    feedback: { kind: 'success', message: t('dashboard.configurationActions.convertedToTarget', { target: boardLabel(target) }) }
  }
}

const NO_DISPLAY = { width: 0, height: 0 }

function sizeLabel(size: { width: number; height: number }): string {
  return size.width === 0 || size.height === 0
    ? 'a board with no display'
    : `${size.width} × ${size.height}`
}

export async function readConfigurationFromBoard(): Promise<ActionFeedback> {
  return run('read', () => window.pitrig.readDeviceConfiguration(), (state) => {
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
  return run('reset', () => window.pitrig.resetDeviceConfiguration(), (result) => {
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
    () => window.pitrig.resetDeviceConfiguration({ document }),
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
  const merged = {
    ...mergeDocument(draft, document, documentOf(board, document)),
    board: draft.board
  }
  store.setDraft(merged)
  useDashboardEditorStore.getState().clampToDocument(
    allWidgetsOf(merged)
      .map((widget) => widget.id)
      .filter((id): id is string => id !== undefined),
    screensOf(merged).length
  )
  return {
    kind: 'success',
    message: t('dashboard.configurationActions.loadedTheDocumentConfigurationFrom', { document: t(`documents.labelLower.${document}`) })
  }
}

export async function restartBoard(): Promise<ActionFeedback | undefined> {
  if (!window.confirm(t('dashboard.configurationActions.restartTheConnectedPitrigBoard'))) return undefined
  return run('reboot', () => window.pitrig.rebootDevice(), () => 'Board is restarting.')
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
