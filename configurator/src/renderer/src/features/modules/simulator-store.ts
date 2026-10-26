import { create } from 'zustand'

export type PreviewSource = 'auto' | 'simhub' | 'simulator'

export type TelemetryState = 'none' | 'idle' | 'game'

export function followsSimHub(source: PreviewSource, telemetry: TelemetryState): boolean {
  if (telemetry === 'none') return false
  return source === 'simhub' || (source === 'auto' && telemetry === 'game')
}

interface SimulatorState {
  values: Readonly<Record<string, number>>
  sweeping: string | null
  idle: boolean
  source: PreviewSource
  setValue: (binding: string, value: number) => void
  setSweeping: (binding: string | null) => void
  setIdle: (idle: boolean) => void
  setSource: (source: PreviewSource) => void
  reset: () => void
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  values: {},
  sweeping: null,
  idle: false,
  source: 'auto',
  setValue: (binding, value) =>
    set((state) => ({
      values: { ...state.values, [binding]: value },
      sweeping: state.sweeping === binding ? null : state.sweeping
    })),
  setSweeping: (sweeping) => set({ sweeping }),
  setIdle: (idle) => set({ idle }),
  setSource: (source) => set({ source }),
  reset: () => set({ values: {}, sweeping: null, idle: false })
}))
