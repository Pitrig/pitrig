import { create } from 'zustand'

import type { DeviceConfiguration } from '@shared/device'
import type {
  BoardUpdateError,
  BoardUpdateProgress,
  BoardUpdateValue
} from '@shared/firmware-update'
import { writeEventLog } from '@/lib/event-log'
import { operationErrorMessage } from '@/features/device/bridge-errors'
import { useDeviceStore } from '@/features/device/device-store'
import { useFirmwareUpdateStore } from './firmware-update-store'
import { t } from '@shared/ui-text'

export interface BoardUpdateOutcome {
  kind: 'success' | 'warning' | 'error'
  message: string
}

interface BoardUpdateStore {
  running: boolean
  progress?: BoardUpdateProgress
  outcome?: BoardUpdateOutcome
  dismiss: () => void
}

export const useBoardUpdateStore = create<BoardUpdateStore>((set) => ({
  running: false,
  dismiss: () => set({ outcome: undefined })
}))

export async function updateBoard(sourceId?: string): Promise<void> {
  if (useBoardUpdateStore.getState().running) return
  useBoardUpdateStore.setState({ running: true, progress: undefined, outcome: undefined })
  const stopProgress = window.pitrig.onBoardUpdateProgress((progress) =>
    useBoardUpdateStore.setState({ progress })
  )
  try {
    const result = await window.pitrig.updateBoard(sourceId === undefined ? {} : { sourceId })
    writeEventLog('Board update completed', result)
    if (!result.ok) {
      useBoardUpdateStore.setState({ outcome: { kind: 'error', message: describeFailure(result.error) } })
      return
    }
    useFirmwareUpdateStore.getState().setSource(undefined)
    if (result.value.restored.length > 0) {
      useDeviceStore
        .getState()
        .markConfigurationSaved(
          result.value.configuration as DeviceConfiguration,
          result.value.applied,
          result.value.restored
        )
    }
    useBoardUpdateStore.setState({ outcome: describeSuccess(result.value) })
  } catch (error) {
    useBoardUpdateStore.setState({ outcome: { kind: 'error', message: operationErrorMessage(error) } })
  } finally {
    stopProgress()
    useBoardUpdateStore.setState({ running: false, progress: undefined })
  }
}

function describeFailure(error: BoardUpdateError): string {
  if (error.code === 'cancelled') return t('firmware.boardUpdate.cancelled')
  return error.message
}

function describeSuccess(value: BoardUpdateValue): BoardUpdateOutcome {
  const { version, backup } = value
  if (backup === undefined) {
    return { kind: 'success', message: t('firmware.boardUpdate.updatedNothingStored', { version }) }
  }
  if (value.restoreFailed !== undefined) {
    return {
      kind: 'warning',
      message: t('firmware.boardUpdate.restoreFailed', { version, backup, reason: value.restoreFailed })
    }
  }
  if (!value.verified) {
    return { kind: 'warning', message: t('firmware.boardUpdate.notVerified', { version, backup }) }
  }
  if (!value.applied) {
    return { kind: 'warning', message: t('firmware.boardUpdate.restoredNotShown', { version, backup }) }
  }
  return {
    kind: 'success',
    message:
      value.restored.length > 0
        ? t('firmware.boardUpdate.updatedAndRestored', { version, backup })
        : t('firmware.boardUpdate.updatedUnchanged', { version, backup })
  }
}
