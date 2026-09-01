import {
  CONDITION_OPERATOR_VALUES,
  FIELD_RANGES,
  LED_ANIMATION_KIND_VALUES,
  LED_EFFECT_TYPE_VALUES,
  LED_FONT_VALUES,
  LED_GATE_VALUES,
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_INDICATOR_SEGMENTS,
  MAXIMUM_WIDGET_CONDITIONS,
  type HardwareDeviceConfiguration,
  type LedEffect
} from '../configuration-schema'
import {
  LED_EFFECT_DRAWS_PIXELS,
  LED_EFFECT_NEEDS_VALUE,
  LED_EFFECT_READS_VALUE,
  drawnSize,
  isMatrix,
  lampsOf,
  shapeOf
} from '../led-render'
import { findBoundError } from './ranges'

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function badEnum(
  value: unknown,
  values: readonly string[],
  label: string,
  key: string
): string | undefined {
  if (value === undefined) return undefined
  return values.includes(value as string)
    ? undefined
    : `${label} sets "${key}" to ${JSON.stringify(value)}; the device knows ${values.join(', ')}.`
}

export function badList(
  value: unknown,
  capacity: number,
  label: string,
  what: string
): string | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return `${label} must carry its ${what} as a list.`
  if (value.length > capacity) {
    return `${label} carries ${value.length} ${what}; the device holds ${capacity}.`
  }
  const stray = value.findIndex(
    (entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry)
  )
  return stray < 0
    ? undefined
    : `${label} carries ${JSON.stringify(value[stray])} among its ${what}, which is not one.`
}

export function badColors(value: unknown, label: string): string | undefined {
  let error: string | undefined
  const walk = (entry: unknown, path: string): void => {
    if (error || entry === null || typeof entry !== 'object') return
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    for (const [key, item] of Object.entries(entry)) {
      if (error) return
      if (key === 'color' || key.endsWith('_color')) {
        if (typeof item !== 'string' || !COLOR_PATTERN.test(item)) {
          error = `${label} sets "${path ? `${path}.` : ''}${key}" to ${JSON.stringify(item)}; a colour is "#RRGGBB".`
          return
        }
        continue
      }
      walk(item, path ? `${path}.${key}` : key)
    }
  }
  walk(value, '')
  return error
}

function badNumber(value: unknown, label: string, key: string): string | undefined {
  if (value === undefined) return undefined
  return Number.isFinite(value)
    ? undefined
    : `${label} sets "${key}" to something that is not a number.`
}

function findContentError(
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  label: string
): string | undefined {
  switch (effect.type ?? 'solid') {
    case 'gradient':
      return (effect.stops ?? []).length >= 2
        ? undefined
        : `${label} is a gradient, which needs at least two colour stops.`
    case 'steps':
      return (effect.steps ?? []).length >= 1
        ? undefined
        : `${label} is a steps layer, which needs at least one step.`
    case 'gauge':
      return (effect.stops ?? []).length !== 1
        ? undefined
        : `${label} is a gauge with a single colour stop; give it none, or two or more.`
    case 'sprite': {
      const sprite = (device.sprites ?? []).find((entry) => entry.id === effect.sprite)
      if (!sprite) {
        return `${label} draws a sprite named ${JSON.stringify(effect.sprite ?? '')}, which this device does not carry.`
      }
      const frames = sprite.frame_count ?? 1
      if ((effect.sprite_frame ?? 0) >= frames) {
        return `${label} names frame ${effect.sprite_frame}, but the sprite holds ${frames}.`
      }
      return undefined
    }
    case 'text':
      return (effect.text ?? '') !== '' || (effect.source?.binding ?? '') !== ''
        ? undefined
        : `${label} is a text layer with neither text nor a source to render.`
    default:
      return undefined
  }
}

function findPanelAreaError(
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  label: string
): string | undefined {
  const mask = effect.panel_mask ?? ''
  if (mask === '') return undefined
  const shape = shapeOf(device)
  if (!shape) return `${label} names panel pixels, which only a matrix has.`
  const drawn = drawnSize(shape)
  const expected = Math.ceil((drawn.width * drawn.height) / 4)
  if (mask.length !== expected) {
    return `${label} carries ${mask.length} mask digits; a ${drawn.width} by ${drawn.height} panel needs ${expected}.`
  }
  let lit = false
  for (const digit of mask) {
    const value = Number.parseInt(digit, 16)
    if (!Number.isInteger(value)) {
      return `${label} carries ${JSON.stringify(digit)} in its mask, which is not a hexadecimal digit.`
    }
    lit = lit || value !== 0
  }
  return lit ? undefined : `${label} selects no pixels at all.`
}

function findListError(effect: LedEffect, label: string): string | undefined {
  return (
    badList(effect.stops, MAXIMUM_COLOR_STOPS, label, 'colour stops') ??
    badList(effect.steps, MAXIMUM_INDICATOR_SEGMENTS, label, 'steps') ??
    badList(effect.conditions, MAXIMUM_WIDGET_CONDITIONS, label, 'rules')
  )
}

function findEnumError(effect: LedEffect, label: string): string | undefined {
  const error =
    badEnum(effect.type, LED_EFFECT_TYPE_VALUES, label, 'type') ??
    badEnum(effect.gate, LED_GATE_VALUES, label, 'gate') ??
    badEnum(effect.animation, LED_ANIMATION_KIND_VALUES, label, 'animation') ??
    badEnum(effect.font, LED_FONT_VALUES, label, 'font')
  if (error) return error
  for (const [index, rule] of (effect.conditions ?? []).entries()) {
    const ruleError = badEnum(rule.op, CONDITION_OPERATOR_VALUES, label, `conditions[${index}].op`)
    if (ruleError) return ruleError
  }
  return undefined
}

function findNumberError(effect: LedEffect, label: string): string | undefined {
  for (const [index, stop] of (effect.stops ?? []).entries()) {
    const error = badNumber(stop?.at, label, `stops[${index}].at`)
    if (error) return error
  }
  for (const [index, step] of (effect.steps ?? []).entries()) {
    const error = badNumber(step?.threshold, label, `steps[${index}].threshold`)
    if (error) return error
  }
  for (const [index, rule] of (effect.conditions ?? []).entries()) {
    if (!Number.isFinite(rule?.value ?? 0)) {
      return `Rule ${index + 1} of ${label} compares against something that is not a number.`
    }
  }
  return undefined
}

function findModifierError(effect: LedEffect, label: string): string | undefined {
  for (const source of [effect.source, effect.condition_source]) {
    const modifiers = source?.modifiers
    if (modifiers === undefined) continue
    if (!Array.isArray(modifiers)) return `${label} must carry its source modifiers as a list.`
    if (modifiers.length > 0) {
      return `${label} carries a source modifier, which an LED layer cannot apply.`
    }
  }
  return undefined
}

export function findEffectError(
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  label: string
): string | undefined {
  const listError = findListError(effect, label)
  if (listError) return listError
  const colorError = badColors(effect, label)
  if (colorError) return colorError
  const enumError = findEnumError(effect, label)
  if (enumError) return enumError
  const numberError = findNumberError(effect, label)
  if (numberError) return numberError
  const rangeError = findBoundError(effect, FIELD_RANGES['LedEffect'], label)
  if (rangeError) return rangeError
  const lamps = lampsOf(device)
  const from = effect.from ?? 0
  const count = effect.count ?? 0
  if (from >= lamps || (count !== 0 && from + count > lamps)) {
    return `${label} covers lamps ${from} to ${from + count} of a device that has ${lamps}.`
  }
  const panelError = findPanelAreaError(device, effect, label)
  if (panelError) return panelError
  const type = effect.type ?? 'solid'
  if (LED_EFFECT_DRAWS_PIXELS.has(type) && !isMatrix(device)) {
    return `${label} is a ${type} layer, which needs a matrix rather than a strip.`
  }
  const modifierError = findModifierError(effect, label)
  if (modifierError) return modifierError
  const bound = (effect.source?.binding ?? '') !== ''
  if (bound && !LED_EFFECT_READS_VALUE.has(type)) {
    return `${label} is a ${type} layer and reads no telemetry, so its source would sit unread.`
  }
  if (!bound && LED_EFFECT_NEEDS_VALUE.has(type)) {
    return `${label} is a ${type} layer and needs telemetry to map.`
  }
  const gated = effect.gate === 'conditions'
  const watched = (effect.condition_source?.binding ?? '') !== ''
  if (gated !== watched || (gated && (effect.conditions ?? []).length === 0)) {
    return `${label} gates on conditions, so it needs a condition source and at least one rule.`
  }
  return findContentError(device, effect, label)
}
