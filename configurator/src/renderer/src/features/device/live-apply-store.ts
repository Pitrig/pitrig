import { create } from 'zustand'

import type { LiveApplyState } from './use-live-apply'

export const useLiveApplyStore = create<LiveApplyState>(() => ({ pending: false }))

export function reportLiveApply(state: LiveApplyState): void {
  useLiveApplyStore.setState(state, true)
}
