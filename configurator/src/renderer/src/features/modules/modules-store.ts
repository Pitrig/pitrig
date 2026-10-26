import { create } from 'zustand'

import type { LedPart } from '@shared/configuration-schema'

import { TRANSPARENT_INK, USABLE_PALETTE } from '@shared/led-sprite'

export type DeviceView = 'wiring' | 'pictures' | 'layers'

export type PickMode = 'toggle' | 'range'

export interface LampZone {
  output: number
  parts?: LedPart[]
  touched: boolean
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

function between(first: number, last: number): number[] {
  const low = Math.min(first, last)
  return Array.from({ length: Math.abs(last - first) + 1 }, (_, offset) => low + offset)
}

function pickedAfter(
  picked: readonly number[],
  primary: number,
  effect: number,
  mode: PickMode
): { picked: number[]; effect: number } {
  if (mode === 'range') {
    const anchor = primary >= 0 ? primary : effect
    return { picked: between(anchor, effect), effect: anchor }
  }
  if (!picked.includes(effect)) {
    return { picked: [...picked, effect].sort((first, second) => first - second), effect }
  }
  const rest = picked.filter((index) => index !== effect)
  return { picked: rest, effect: rest.includes(primary) ? primary : (rest.at(-1) ?? -1) }
}

interface ModulesState {
  output: number
  effect: number
  picked: readonly number[]
  sprite: number
  frame: number
  ink: number
  deviceView: DeviceView
  zone: LampZone | null
  preview: readonly PreviewTarget[]
  previewError?: string
  select: (output: number) => void
  selectEffect: (effect: number) => void
  pickEffect: (effect: number, mode: PickMode) => void
  pickEffects: (effects: readonly number[]) => void
  selectSprite: (sprite: number, inks?: number) => void
  selectFrame: (frame: number) => void
  selectInk: (ink: number) => void
  setDeviceView: (view: DeviceView) => void
  setZone: (zone: LampZone | null) => void
  togglePreview: (output: number, effect: number) => void
  toggleSpritePreview: (output: number, sprite: string, speedMs: number) => void
  setPreviewSpeed: (speedMs: number) => void
  clearPreview: (output?: number) => void
  reportPreviewError: (error?: string) => void
}

export const useModulesStore = create<ModulesState>((set) => ({
  output: 0,
  effect: -1,
  picked: [],
  sprite: -1,
  frame: 0,
  ink: 1,
  deviceView: 'layers',
  zone: null,
  preview: [],
  select: (output) =>
    set({
      output,
      effect: -1,
      picked: [],
      sprite: -1,
      frame: 0,
      zone: null,
      preview: [],
      previewError: undefined
    }),
  selectEffect: (effect) => set({ effect, picked: effect >= 0 ? [effect] : [] }),
  pickEffect: (effect, mode) =>
    set((state) => pickedAfter(state.picked, state.effect, effect, mode)),
  pickEffects: (effects) =>
    set({ picked: [...effects], effect: effects.at(-1) ?? -1 }),
  selectSprite: (sprite, inks) =>
    set((state) => ({ sprite, frame: 0, ink: inkWithin(state.ink, inks) })),
  selectFrame: (frame) => set({ frame }),
  selectInk: (ink) => set({ ink }),
  setDeviceView: (deviceView) => set({ deviceView, zone: null }),
  setZone: (zone) => set({ zone }),
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
