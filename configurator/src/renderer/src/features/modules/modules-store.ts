import { create } from 'zustand'

interface ModulesState {
  output: number
  effect: number
  value: number
  playing: boolean
  gates: Record<string, boolean>
  select: (output: number) => void
  selectEffect: (effect: number) => void
  setValue: (value: number) => void
  togglePlaying: () => void
  toggleGate: (key: string) => void
  clearGates: (device?: number) => void
}

export const useModulesStore = create<ModulesState>((set) => ({
  output: 0,
  effect: -1,
  value: 0.6,
  playing: true,
  gates: {},
  select: (output) => set({ output, effect: -1 }),
  selectEffect: (effect) => set({ effect }),
  setValue: (value) => set({ value, playing: false }),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  toggleGate: (key) =>
    set((state) => ({ gates: { ...state.gates, [key]: state.gates[key] === false } })),
  clearGates: (device) =>
    set((state) => ({
      gates:
        device === undefined
          ? {}
          : Object.fromEntries(
              Object.entries(state.gates).filter(
                ([key]) => !key.startsWith(`${device}:`)
              )
            )
    }))
}))
