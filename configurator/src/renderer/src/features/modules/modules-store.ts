import { create } from 'zustand'

import { TRANSPARENT_INK, USABLE_PALETTE } from '@shared/led-sprite'

export type DeviceView = 'wiring' | 'pictures' | 'layers'

export interface LampHighlight {
  output: number
  from: number
  count: number
}

export type PreviewTarget =
  | { kind: 'layer'; output: number; effect: number }
  | { kind: 'sprite'; output: number; sprite: string; speedMs: number }

type Matcher = (entry: PreviewTarget) => boolean

export function playingLayer(output: number, effect: number): Matcher {
  return (entry) => entry.kind === 'layer' && entry.output === output && entry.effect === effect
}

export function playingSprite(output: number, sprite: string): Matcher {
  return (entry) => entry.kind === 'sprite' && entry.output === output && entry.sprite === sprite
}

function inkWithin(ink: number, inks: number | undefined): number {
  if (inks === undefined || inks <= 0) return ink
  if (ink === TRANSPARENT_INK) return inks <= USABLE_PALETTE ? ink : inks - 1
  return Math.max(0, Math.min(ink, inks - 1))
}

function toggled(
  playing: readonly PreviewTarget[],
  target: PreviewTarget,
  matches: Matcher
): PreviewTarget[] {
  if (playing.some(matches)) return playing.filter((entry) => !matches(entry))
  return [...playing.filter((entry) => entry.output === target.output), target]
}

interface ModulesState {
  output: number
  effect: number
  sprite: number
  frame: number
  ink: number
  deviceView: DeviceView
  highlight: LampHighlight | null
  preview: readonly PreviewTarget[]
  previewError?: string
  select: (output: number) => void
  selectEffect: (effect: number) => void
  selectSprite: (sprite: number, inks?: number) => void
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
  preview: [],
  select: (output) =>
    set({
      output,
      effect: -1,
      sprite: -1,
      frame: 0,
      highlight: null,
      preview: [],
      previewError: undefined
    }),
  selectEffect: (effect) => set({ effect }),
  selectSprite: (sprite, inks) =>
    set((state) => ({ sprite, frame: 0, ink: inkWithin(state.ink, inks) })),
  selectFrame: (frame) => set({ frame }),
  selectInk: (ink) => set({ ink }),
  setDeviceView: (deviceView) => set({ deviceView, highlight: null }),
  setHighlight: (highlight) => set({ highlight }),
  togglePreview: (output, effect) =>
    set((state) => ({
      previewError: undefined,
      preview: toggled(
        state.preview,
        { kind: 'layer', output, effect },
        playingLayer(output, effect)
      )
    })),
  toggleSpritePreview: (output, sprite, speedMs) =>
    set((state) => ({
      previewError: undefined,
      preview: toggled(
        state.preview,
        { kind: 'sprite', output, sprite, speedMs },
        playingSprite(output, sprite)
      )
    })),
  setPreviewSpeed: (speedMs) =>
    set((state) => ({
      preview: state.preview.map((entry) =>
        entry.kind === 'sprite' ? { ...entry, speedMs } : entry
      )
    })),
  clearPreview: (output) =>
    set((state) => ({
      previewError: undefined,
      preview:
        output === undefined
          ? []
          : state.preview.filter((entry) => entry.output !== output)
    })),
  reportPreviewError: (previewError) => set({ previewError })
}))
