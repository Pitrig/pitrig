import { create } from 'zustand'

export type DeviceView = 'wiring' | 'layers'

export interface LampHighlight {
  output: number
  from: number
  count: number
}

export interface LayerPreview {
  output: number
  effect: number
}

interface ModulesState {
  output: number
  effect: number
  deviceView: DeviceView
  highlight: LampHighlight | null
  preview: LayerPreview | null
  previewError?: string
  select: (output: number) => void
  selectEffect: (effect: number) => void
  setDeviceView: (view: DeviceView) => void
  setHighlight: (highlight: LampHighlight | null) => void
  togglePreview: (output: number, effect: number) => void
  clearPreview: (output?: number) => void
  reportPreviewError: (error?: string) => void
}

export const useModulesStore = create<ModulesState>((set) => ({
  output: 0,
  effect: -1,
  deviceView: 'layers',
  highlight: null,
  preview: null,
  select: (output) =>
    set({ output, effect: -1, highlight: null, preview: null, previewError: undefined }),
  selectEffect: (effect) => set({ effect }),
  setDeviceView: (deviceView) => set({ deviceView, highlight: null }),
  setHighlight: (highlight) => set({ highlight }),
  togglePreview: (output, effect) =>
    set((state) => ({
      previewError: undefined,
      preview:
        state.preview?.output === output && state.preview.effect === effect
          ? null
          : { output, effect }
    })),
  clearPreview: (output) =>
    set((state) => ({
      previewError: undefined,
      preview: output === undefined || state.preview?.output === output ? null : state.preview
    })),
  reportPreviewError: (previewError) => set({ previewError })
}))
