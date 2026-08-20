import { create } from 'zustand'

import { isUnresolvedFonts, type SaveProgress } from '@shared/save-to-board'
import type { DeviceConfiguration } from '@shared/device'
import { writeDebugLog } from '@/features/debug/debug-log'
import { operationErrorMessage } from './bridge-errors'
import { formatConfiguration, useDeviceStore } from './device-store'

/**
 * The state of a save to the board, held in a store rather than in whichever
 * panel started it.
 *
 * The save outlives its button: it is one sequence in the main process that can
 * install fonts and restart the board, and the author is free to switch
 * workspaces while it runs. Local state would be thrown away by that switch —
 * and, when a restart reconnects the board, by the remount that follows.
 */

interface SaveToBoardStore {
  running: boolean
  progress?: SaveProgress
  /**
   * Families the library could not answer for. Nothing was written when this is
   * set, so the dashboard on the board is exactly as it was — the dialog asks
   * for the file and offers to try again.
   */
  unresolvedFonts?: string[]
  dismissUnresolvedFonts: () => void
}

export const useSaveToBoardStore = create<SaveToBoardStore>((set) => ({
  running: false,
  dismissUnresolvedFonts: () => set({ unresolvedFonts: undefined })
}))

/**
 * Resolve the fonts, install what the board lacks, save, and make the running
 * dashboard match — one call, because that is one act as far as the author is
 * concerned. The board restarts only when a font package was installed; see
 * `SaveToBoardService`.
 */
export async function saveDraftToBoard(): Promise<void> {
  if (useSaveToBoardStore.getState().running) return
  const device = useDeviceStore.getState()
  const draft = device.draft
  if (!draft) {
    device.setSaveFeedback({ kind: 'error', message: 'There is no configuration to save.' })
    return
  }
  const json = device.rawDraft ?? formatConfiguration(draft)

  useSaveToBoardStore.setState({ running: true, progress: undefined, unresolvedFonts: undefined })
  device.setSaveFeedback(undefined)
  const stopProgress = window.simcore.onSaveProgress((progress) =>
    useSaveToBoardStore.setState({ progress })
  )
  try {
    const result = await window.simcore.saveToBoard({ json })
    writeDebugLog('Save to board completed', result)
    if (!result.ok) {
      if (isUnresolvedFonts(result.error)) {
        useSaveToBoardStore.setState({ unresolvedFonts: result.error.families })
      }
      device.setSaveFeedback({ kind: 'error', message: result.error.message })
      return
    }
    useDeviceStore
      .getState()
      .markConfigurationSaved(result.value.configuration as DeviceConfiguration)
    useDeviceStore.getState().setSaveFeedback({
      kind: result.value.reconnectFailed ? 'error' : 'success',
      message: describeSave(result.value)
    })
  } catch (error) {
    useDeviceStore
      .getState()
      .setSaveFeedback({ kind: 'error', message: operationErrorMessage(error) })
  } finally {
    stopProgress()
    useSaveToBoardStore.setState({ running: false, progress: undefined })
  }
}

/**
 * What the save actually did. The restart is the part worth reporting: it is
 * the difference between a dashboard that changed in place and ten seconds of a
 * dark screen, and the author should know which one they just paid for.
 */
function describeSave(value: {
  fontsUploaded: boolean
  restarted: boolean
  reconnectFailed?: boolean
  applyFailed?: string
}): string {
  if (value.reconnectFailed) {
    return 'Saved, but the board did not come back on its port. Reconnect it by hand.'
  }
  if (value.applyFailed) {
    return `Saved. The board keeps showing the previous dashboard until it restarts: ${value.applyFailed}`
  }
  if (value.fontsUploaded) {
    return 'Fonts installed and configuration saved. The board restarted and is running the new dashboard.'
  }
  return 'Saved. The board is running the new dashboard — no restart needed.'
}

/** How far along the save is, as one label per stage. */
export const SAVE_STAGE_LABELS: Record<SaveProgress['stage'], string> = {
  preparing: 'Checking fonts',
  building: 'Building the font package',
  uploading: 'Installing fonts',
  saving: 'Saving the configuration',
  applying: 'Applying to the board',
  rebooting: 'Restarting the board',
  reconnecting: 'Reconnecting',
  completed: 'Saved'
}
