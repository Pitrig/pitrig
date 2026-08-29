import { create } from 'zustand'

import { isUnresolvedFonts, type SaveProgress } from '@shared/save-to-board'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'
import { writeDebugLog } from '@/features/debug/debug-log'
import { operationErrorMessage } from './bridge-errors'
import { formatConfiguration, useDeviceStore } from './device-store'

interface SaveToBoardStore {
  running: boolean
  progress?: SaveProgress
  unresolvedFonts?: string[]
  dismissUnresolvedFonts: () => void
}

export const useSaveToBoardStore = create<SaveToBoardStore>((set) => ({
  running: false,
  dismissUnresolvedFonts: () => set({ unresolvedFonts: undefined })
}))

export async function saveDraftToBoard(
  documents?: ConfigurationDocumentId[]
): Promise<void> {
  if (useSaveToBoardStore.getState().running) return
  const device = useDeviceStore.getState()
  const draft = device.draft
  if (!draft) {
    device.setSaveFeedback({ kind: 'error', message: 'There is no configuration to save.' })
    return
  }
  const json = formatConfiguration(draft)

  useSaveToBoardStore.setState({ running: true, progress: undefined, unresolvedFonts: undefined })
  device.setSaveFeedback(undefined)
  const stopProgress = window.simcore.onSaveProgress((progress) =>
    useSaveToBoardStore.setState({ progress })
  )
  try {
    const result = await window.simcore.saveToBoard({
      json,
      ...(documents ? { documents } : {})
    })
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
      .markConfigurationSaved(
        result.value.configuration as DeviceConfiguration,
        result.value.applyFailed === undefined
      )
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
