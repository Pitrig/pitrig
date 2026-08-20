import { create } from 'zustand'

import type { LiveApplyState } from './use-live-apply'

/**
 * Whether the board is currently being brought up to the draft, and what went
 * wrong if it was refused.
 *
 * Live apply runs at the window level so it keeps working while the author is
 * on any page; the state has to be readable from wherever it is shown, which is
 * the canvas toolbar. A store is the shortest path between the two.
 */
export const useLiveApplyStore = create<LiveApplyState>(() => ({ pending: false }))

export function reportLiveApply(state: LiveApplyState): void {
  useLiveApplyStore.setState(state, true)
}
