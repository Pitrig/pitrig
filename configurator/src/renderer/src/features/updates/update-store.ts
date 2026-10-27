import { create } from 'zustand'

import type { PrepareFirmwareResult, UpdateStatus } from '@shared/app-updates'
import { operationErrorMessage } from '@/features/device/bridge-errors'
import { confirmAction } from '@/components/ui/confirm-store'
import { useFirmwareUpdateStore } from '@/features/firmware-update/firmware-update-store'
import { updateBoard } from '@/features/firmware-update/board-update-store'
import { t } from '@shared/ui-text'

interface UpdateStore {
  status?: UpdateStatus
  checking: boolean
  preparing: boolean
  feedback?: { kind: 'success' | 'error'; message: string }
  dismissed: string[]
  dismiss: (key: string) => void
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  checking: false,
  preparing: false,
  dismissed: [],
  dismiss: (key) => set((current) => ({ dismissed: [...current.dismissed, key] }))
}))

export function subscribeToUpdates(): () => void {
  let active = true
  void window.pitrig
    .getUpdateStatus()
    .then((status) => {
      if (active) useUpdateStore.setState({ status })
    })
    .catch(() => undefined)
  const stop = window.pitrig.onUpdateStatus((status) => useUpdateStore.setState({ status }))
  return () => {
    active = false
    stop()
  }
}

export async function checkForUpdates(): Promise<void> {
  if (useUpdateStore.getState().checking) return
  useUpdateStore.setState({ checking: true, feedback: undefined })
  try {
    useUpdateStore.setState({ status: await window.pitrig.checkForUpdates() })
  } finally {
    useUpdateStore.setState({ checking: false })
  }
}

export async function updateBoardFromRelease(): Promise<void> {
  if (useUpdateStore.getState().preparing) return
  useUpdateStore.setState({ preparing: true, feedback: undefined })
  let prepared: PrepareFirmwareResult
  try {
    prepared = await window.pitrig.prepareReleaseFirmware()
  } catch (error) {
    prepared = { ok: false, error: { code: 'device_error', message: operationErrorMessage(error) } }
  } finally {
    useUpdateStore.setState({ preparing: false })
  }
  if (!prepared.ok) {
    useUpdateStore.setState({ feedback: { kind: 'error', message: prepared.error.message } })
    return
  }
  useFirmwareUpdateStore.getState().setSource(prepared.value)
  await updateBoard(prepared.value.id)
}

export async function installSimHubPlugin(): Promise<void> {
  useUpdateStore.setState({ feedback: undefined })
  let result = await window.pitrig.installSimHubPlugin({ closeSimHub: false })
  if (result.outcome === 'simhub_running') {
    if (!(await confirmAction(t('updates.simhub.closeToReplace')))) return
    result = await window.pitrig.installSimHubPlugin({ closeSimHub: true })
  }
  useUpdateStore.setState({
    feedback:
      result.outcome === 'installed'
        ? { kind: 'success', message: t('updates.simhub.pluginInstalled') }
        : { kind: 'error', message: result.message ?? t('updates.simhub.copyFailedPlain') }
  })
}
