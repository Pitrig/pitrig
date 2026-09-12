import { create } from 'zustand'

export type DebugView = 'console' | 'bench'

interface DebugViewStore {
  view: DebugView
  setView: (view: DebugView) => void
}

export const useDebugViewStore = create<DebugViewStore>((set) => ({
  view: 'console',
  setView: (view) => set({ view })
}))
