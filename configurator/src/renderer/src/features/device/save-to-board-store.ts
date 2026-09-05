import { create } from 'zustand'

import { isUnresolvedFonts, type SaveProgress } from '@shared/save-to-board'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'
import { writeEventLog } from '@/lib/event-log'
import { operationErrorMessage } from './bridge-errors'
import { formatConfiguration, useDeviceStore } from './device-store'
import { t } from '@shared/ui-text'

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
    device.setSaveFeedback({ kind: 'error', message: t('dashboard.configurationActions.thereIsNoConfigurationTo') })
    return
  }
  const json = formatConfiguration(draft)

  useSaveToBoardStore.setState({ running: true, progress: undefined, unresolvedFonts: undefined })
  device.setSaveFeedback(undefined)
  const stopProgress = window.pitrig.onSaveProgress((progress) =>
    useSaveToBoardStore.setState({ progress })
  )
  try {
    const result = await window.pitrig.saveToBoard({
      json,
      ...(documents ? { documents } : {})
    })
    writeEventLog('Save to board completed', result)
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
    return t('device.saveToBoardStore.savedButTheBoardDid')
  }
  if (value.applyFailed) {
    return t('device.saveToBoardStore.savedTheBoardKeepsShowing', { applyFailed: value.applyFailed })
  }
  if (value.fontsUploaded) {
    return t('device.saveToBoardStore.fontsInstalledAndConfigurationSaved')
  }
  return t('device.saveToBoardStore.savedTheBoardIsRunning')
}

