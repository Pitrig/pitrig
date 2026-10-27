import type { LedEffect } from '@shared/configuration-schema'

export function layerColor(effect: LedEffect): string {
  switch (effect.type ?? 'solid') {
    case 'steps':
      return effect.steps?.at(-1)?.color ?? '#38BDF8'
    case 'gradient':
      return effect.stops?.[Math.floor((effect.stops.length - 1) / 2)]?.color ?? '#38BDF8'
    case 'sprite':
      return '#E5E7EB'
    default:
      return effect.color ?? '#ffffff'
  }
}
