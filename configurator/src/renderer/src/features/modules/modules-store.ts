import { create } from 'zustand'

export type DeviceView = 'wiring' | 'pictures' | 'layers'

export interface LampHighlight {
  output: number
  from: number
  count: number
}

export type PreviewTarget =
  | { kind: 'layer'; output: number; effect: number }
  | { kind: 'sprite'; output: number; sprite: string; speedMs: number }

interface ModulesState {
  output: number
  effect: number
  sprite: number
  frame: number
  ink: number
  deviceView: DeviceView
  highlight: LampHighlight | null
  preview: PreviewTarget | null
  previewError?: string
  select: (output: number) => void
  selectEffect: (effect: number) => void
  selectSprite: (sprite: number) => void
  selectFrame: (frame: number) => void
  selectInk: (ink: number) => void
  setDeviceView: (view: DeviceView) => void
  setHighlight: (highlight: LampHighlight | null) => void
  togglePreview: (output: number, effect: number) => void
  toggleSpritePreview: (output: number, sprite: string, speedMs: number) => void
  setPreviewSpeed: (speedMs: number) => void
  clearPreview: (output?: number) => void
  reportPreviewError: (error?: string) => void
}

export const useModulesStore = create<ModulesState>((set) => ({
  output: 0,
  effect: -1,
  sprite: -1,
  frame: 0,
  ink: 1,
  deviceView: 'layers',
  highlight: null,
  preview: null,
  select: (output) =>
    set({
      output,
      effect: -1,
      sprite: -1,
      frame: 0,
      highlight: null,
      preview: null,
      previewError: undefined
    }),
  selectEffect: (effect) => set({ effect }),
  selectSprite: (sprite) => set({ sprite, frame: 0 }),
  selectFrame: (frame) => set({ frame }),
  selectInk: (ink) => set({ ink }),
  setDeviceView: (deviceView) => set({ deviceView, highlight: null }),
  setHighlight: (highlight) => set({ highlight }),
  togglePreview: (output, effect) =>
    set((state) => ({
      previewError: undefined,
      preview:
        state.preview?.kind === 'layer' &&
        state.preview.output === output &&
        state.preview.effect === effect
          ? null
          : { kind: 'layer', output, effect }
    })),
  toggleSpritePreview: (output, sprite, speedMs) =>
    set((state) => ({
      previewError: undefined,
      preview:
        state.preview?.kind === 'sprite' &&
        state.preview.output === output &&
        state.preview.sprite === sprite
          ? null
          : { kind: 'sprite', output, sprite, speedMs }
    })),
  setPreviewSpeed: (speedMs) =>
    set((state) =>
      state.preview?.kind === 'sprite' ? { preview: { ...state.preview, speedMs } } : {}
    ),
  clearPreview: (output) =>
    set((state) => ({
      previewError: undefined,
      preview: output === undefined || state.preview?.output === output ? null : state.preview
    })),
  reportPreviewError: (previewError) => set({ previewError })
}))
