import { writeDebugLog } from '@/features/debug/debug-log'
import { bridgeErrorMessage, operationErrorMessage } from '@/features/device/bridge-errors'
import { useDashboardEditorStore } from '@/features/configuration/dashboard-editor'
import { formatConfiguration, useDeviceStore } from '@/features/device/device-store'
import { validateConfigurationDocument } from '@shared/configuration-validate'
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

/**
 * Everything that replaces or writes the whole document, in one place.
 *
 * These used to be methods on the configuration panel, which meant the panel
 * had to be mounted for a keystroke to reach them — Cmd/Ctrl+S among them. They
 * are plain functions over the two stores now, so the Configs page, the canvas
 * toolbar and a window-level shortcut can all call the same one.
 */

export type ActionFeedback = { kind: 'success' | 'error'; message: string }

/**
 * A different document is a different set of widgets, so the selection, the
 * locked and hidden layers and the zoom all describe nothing any more.
 */
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
    writeDebugLog('Configuration file load completed', result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    if (!result.value) return undefined
    adoptNewDocument(result.value.configuration, result.value.fileName)
    return { kind: 'success', message: `${result.value.fileName} loaded.` }
  } catch (error) {
    return { kind: 'error', message: bridgeErrorMessage(error) }
  }
}

/**
 * Cmd/Ctrl+S, and the Save button beside Open. To a file rather than to the
 * board: saving to the board can install fonts and restart, which is not what a
 * keystroke should set off.
 */
export async function saveConfigurationFile(): Promise<ActionFeedback | undefined> {
  const { draft, rawDraft } = useDeviceStore.getState()
  if (!draft) return { kind: 'error', message: 'There is no configuration to save.' }
  try {
    const result = await window.simcore.saveConfigurationFile({
      json: rawDraft ?? formatConfiguration(draft)
    })
    writeDebugLog('Configuration file save completed', result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    if (!result.value.saved) return undefined
    adoptNewDocument(draft, result.value.fileName)
    return { kind: 'success', message: `${result.value.fileName ?? 'Configuration'} saved.` }
  } catch (error) {
    return { kind: 'error', message: bridgeErrorMessage(error) }
  }
}

/** One of the application's own saved configurations. */
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

/** One of the files the Open and Save dialogs touched, wherever it lives. */
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

/**
 * Moving the draft onto a different display.
 *
 * Offered wherever a board is chosen — the Configs page and the canvas header —
 * because the two are the same act seen from either end: picking a board while
 * a draft exists *is* asking for the layout to come with you. It confirms in
 * numbers rather than in adjectives, because "keep proportions" says nothing
 * about how much of the new display a layout will leave empty.
 *
 * Returns the transfer report as well as the outcome: what did not carry across
 * (image bitmaps above all, which the device never rescales) is the part worth
 * reading afterwards.
 */
export function convertDraftToBoard(
  target: SimCoreBoardId,
  fit: LayoutFit,
  display?: { width: number; height: number }
): { feedback?: ActionFeedback; report?: LayoutTransferResult } {
  const { draft, setDraft } = useDeviceStore.getState()
  if (!draft) return { feedback: { kind: 'error', message: 'There is no draft to convert.' } }
  const from = BOARD_PROFILES[draft.board]?.display
  const to = display ?? BOARD_PROFILES[target].display
  if (!from) return { feedback: { kind: 'error', message: 'The draft names an unknown board.' } }
  if (
    !window.confirm(
      `Convert the draft from ${from.width} × ${from.height} to ${to.width} × ${to.height}? ${fitOutcome(from, to, fit)}`
    )
  ) {
    return {}
  }

  // The connected board answers for its own display; the profile is what the
  // editor falls back to when nothing is plugged in.
  const transferred = transferConfiguration(draft, { board: target, display, fit })
  // The transfer scales geometry and rewrites the board identifier; the rate the
  // new board needs is not layout, so it is filled in here.
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
  // setDraft rather than replacing the document: this records history, so the
  // conversion is undoable, and a transfer preserves every widget and screen id
  // — so the selection, the locked and hidden layers and the open slot page all
  // still address real widgets.
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
    writeDebugLog(`Configuration ${operation} completed`, result)
    if (!result.ok) return { kind: 'error', message: result.error.message }
    return { kind: 'success', message: onSuccess(result.value) }
  } catch (error) {
    const message = operationErrorMessage(error)
    writeDebugLog(`Configuration ${operation} failed`, { message })
    return { kind: 'error', message }
  }
}
