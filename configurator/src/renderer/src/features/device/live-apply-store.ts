import { create } from 'zustand'

import { useDeviceStore } from './device-store'
import type { LiveApplyState } from './use-live-apply'

const IDLE: LiveApplyState = { pending: false }

export const useLiveApplyStore = create<LiveApplyState>(() => ({ ...IDLE }))

export function reportLiveApply(state: LiveApplyState): void {
  useLiveApplyStore.setState(state, true)
}

useDeviceStore.subscribe((state, previous) => {
  const reconnected = state.connectionRevision !== previous.connectionRevision
  const dropped = state.status !== 'connected' && previous.status === 'connected'
  if (reconnected || dropped) useLiveApplyStore.setState({ ...IDLE }, true)
})
