import type { LedEffect, RgbColor } from '@shared/configuration-schema'
import { LED_EFFECT_READS_VALUE } from '@shared/led-render'

export type EffectType = NonNullable<LedEffect['type']>

const RANGED_BINDING = 'engine.rpm_percent'
const RANGE_MINIMUM = 0
const RANGE_MAXIMUM = 100
const TEXT_BINDING = 'transmission.gear'
const STEP_THRESHOLD = 0.5
const STEP_COLOR: RgbColor = '#00C853'
const RAMP_START: RgbColor = '#38BDF8'
const RAMP_END: RgbColor = '#D50000'

function seedRangedSource(effect: LedEffect): void {
  if (effect.source?.binding) return
  effect.source = { binding: RANGED_BINDING }
  effect.minimum = RANGE_MINIMUM
  effect.maximum = RANGE_MAXIMUM
}

function seedContent(effect: LedEffect, type: EffectType, pictures: readonly string[]): void {
  if (type === 'sprite') {
    const picture = pictures[0]
    if (picture !== undefined) effect.sprite = picture
    return
  }
  if (type === 'steps') {
    seedRangedSource(effect)
    if ((effect.steps ?? []).length === 0) {
      effect.steps = [{ threshold: STEP_THRESHOLD, color: STEP_COLOR }]
    }
    return
  }
  if (type === 'gauge') {
    seedRangedSource(effect)
    if ((effect.stops ?? []).length === 1) delete effect.stops
    return
  }
  if (type === 'gradient') {
    if ((effect.stops ?? []).length < 2) {
      effect.stops = [
        { at: 0, color: RAMP_START },
        { at: 1, color: RAMP_END }
      ]
    }
    return
  }
  if (type === 'text' && (effect.text ?? '') === '' && !effect.source?.binding) {
    effect.source = { binding: TEXT_BINDING }
  }
}

export function applyEffectType(
  effect: LedEffect,
  type: EffectType,
  pictures: readonly string[]
): void {
  effect.type = type
  if (!LED_EFFECT_READS_VALUE.has(type)) {
    delete effect.source
    delete effect.minimum
    delete effect.maximum
  }
  if (type !== 'sprite') {
    delete effect.sprite
    delete effect.sprite_frame
    delete effect.sprite_loop
  }
  if (type !== 'text') {
    delete effect.text
    delete effect.font
  }
  if (type !== 'gradient' && type !== 'gauge') delete effect.stops
  if (type !== 'steps') delete effect.steps
  if (type !== 'animation') delete effect.animation
  seedContent(effect, type, pictures)
}
