import type { LedEffect } from '@shared/configuration-schema'

export function layerName(effect: LedEffect, index: number): string {
  return effect.id || effect.type || `Layer ${index + 1}`
}
