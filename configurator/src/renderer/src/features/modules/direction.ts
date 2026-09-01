import type { LedEffect } from '@shared/configuration-schema'

export const LAYER_DIRECTIONS = [
  'along the run',
  'backwards',
  'out from the middle',
  'in from the ends'
] as const

export type LayerDirection = (typeof LAYER_DIRECTIONS)[number]

export const LED_EFFECT_USES_DIRECTION: ReadonlySet<string> = new Set([
  'steps',
  'gauge',
  'gradient',
  'animation'
])

export function directionOf(effect: LedEffect): LayerDirection {
  if (!effect.mirrored) return effect.inverted ? 'backwards' : 'along the run'
  return effect.inverted ? 'in from the ends' : 'out from the middle'
}

export function applyDirection(effect: LedEffect, direction: LayerDirection): void {
  const mirrored = direction === 'out from the middle' || direction === 'in from the ends'
  const inverted = direction === 'backwards' || direction === 'in from the ends'
  if (mirrored) effect.mirrored = true
  else delete effect.mirrored
  if (inverted) effect.inverted = true
  else delete effect.inverted
}
