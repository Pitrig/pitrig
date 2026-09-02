import {
  CONDITION_OPERATOR_VALUES,
  FIELD_RANGES,
  LED_ANIMATION_KIND_VALUES,
  LED_EFFECT_TYPE_VALUES,
  LED_FONT_VALUES,
  LED_GATE_VALUES,
  MAXIMUM_COLOR_STOPS,
  MAXIMUM_INDICATOR_SEGMENTS,
  MAXIMUM_LED_COLOR_RULES,
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
import { t } from '../ui-text'

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
    : t('validation.ledValues.labelSetsKeyToValue', { label: label, key: key, value: JSON.stringify(value), join: values.join(', ') })
}

export function badList(
  value: unknown,
  capacity: number,
  label: string,
  what: string
): string | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return t('validation.ledValues.labelMustCarryItsWhat', { label: label, what: what })
  if (value.length > capacity) {
    return t('validation.ledValues.labelCarriesLengthWhatThe', { label: label, length: value.length, what: what, capacity: capacity })
  }
  const stray = value.findIndex(
    (entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry)
  )
  return stray < 0
    ? undefined
    : t('validation.ledValues.labelCarriesStrayAmongIts', { label: label, stray: JSON.stringify(value[stray]), what: what })
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
    : t('validation.ledValues.labelSetsKeyToSomething', { label: label, key: key })
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
        : t('validation.ledValues.labelIsAGradientWhich', { label: label })
    case 'steps':
      return (effect.steps ?? []).length >= 1
        ? undefined
        : t('validation.ledValues.labelIsAStepsLayer', { label: label })
    case 'gauge':
      return (effect.stops ?? []).length !== 1
        ? undefined
        : t('validation.ledValues.labelIsAGaugeWith', { label: label })
    case 'sprite': {
      const sprite = (device.sprites ?? []).find((entry) => entry.id === effect.sprite)
      if (!sprite) {
        return t('validation.ledValues.labelDrawsASpriteNamed', { label: label, sprite: JSON.stringify(effect.sprite ?? '') })
      }
      const frames = sprite.frame_count ?? 1
      if ((effect.sprite_frame ?? 0) >= frames) {
        return t('validation.ledValues.labelNamesFrameSpriteFrame', { label: label, sprite_frame: effect.sprite_frame ?? 0, frames: frames })
      }
      return undefined
    }
    case 'text':
      return (effect.text ?? '') !== '' || (effect.source?.binding ?? '') !== ''
        ? undefined
        : t('validation.ledValues.labelIsATextLayer', { label: label })
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
  if (!shape) return t('validation.ledValues.labelNamesPanelPixelsWhich', { label: label })
  const drawn = drawnSize(shape)
  const expected = Math.ceil((drawn.width * drawn.height) / 4)
  if (mask.length !== expected) {
    return t('validation.ledValues.labelCarriesLengthMaskDigits', { label: label, length: mask.length, width: drawn.width, height: drawn.height, expected: expected })
  }
  let lit = false
  for (const digit of mask) {
    const value = Number.parseInt(digit, 16)
    if (!Number.isInteger(value)) {
      return t('validation.ledValues.labelCarriesDigitInIts', { label: label, digit: JSON.stringify(digit) })
    }
    lit = lit || value !== 0
  }
  return lit ? undefined : t('validation.ledValues.labelSelectsNoPixelsAt', { label: label })
}

function findListError(effect: LedEffect, label: string): string | undefined {
  return (
    badList(effect.stops, MAXIMUM_COLOR_STOPS, label, t('validation.ledValues.colourStops')) ??
    badList(effect.steps, MAXIMUM_INDICATOR_SEGMENTS, label, 'steps') ??
    badList(effect.conditions, MAXIMUM_WIDGET_CONDITIONS, label, 'rules') ??
    badList(effect.color_rules, MAXIMUM_LED_COLOR_RULES, label, t('validation.ledValues.colourRules'))
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
  for (const [index, rule] of (effect.color_rules ?? []).entries()) {
    const ruleError = badEnum(rule.op, CONDITION_OPERATOR_VALUES, label, `color_rules[${index}].op`)
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
  for (const [index, rule] of (effect.color_rules ?? []).entries()) {
    if (!Number.isFinite(rule?.value ?? 0)) {
      return `Colour rule ${index + 1} of ${label} compares against something that is not a number.`
    }
  }
  return undefined
}

function findModifierError(effect: LedEffect, label: string): string | undefined {
  for (const source of [effect.source, effect.condition_source]) {
    const modifiers = source?.modifiers
    if (modifiers === undefined) continue
    if (!Array.isArray(modifiers)) return t('validation.ledValues.labelMustCarryItsSource', { label: label })
    if (modifiers.length > 0) {
      return t('validation.ledValues.labelCarriesASourceModifier', { label: label })
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
    return t('validation.ledValues.labelIsATypeLayer', { label: label, type: type })
  }
  const modifierError = findModifierError(effect, label)
  if (modifierError) return modifierError
  const bound = (effect.source?.binding ?? '') !== ''
  if (bound && !LED_EFFECT_READS_VALUE.has(type)) {
    return t('validation.ledValues.labelIsATypeLayer2', { label: label, type: type })
  }
  if (!bound && LED_EFFECT_NEEDS_VALUE.has(type)) {
    return t('validation.ledValues.labelIsATypeLayer3', { label: label, type: type })
  }
  const gated = effect.gate === 'conditions'
  const coloured = (effect.color_rules ?? []).length > 0
  const watched = (effect.condition_source?.binding ?? '') !== ''
  if (watched !== (gated || coloured) || (gated && (effect.conditions ?? []).length === 0)) {
    return t('validation.ledValues.labelNeedsAWatchedSource', { label: label })
  }
  for (const [index, rule] of (effect.color_rules ?? []).entries()) {
    const ruleRange = findBoundError(
      rule,
      FIELD_RANGES['LedColorRule'],
      `Colour rule ${index + 1} of ${label}`
    )
    if (ruleRange) return ruleRange
    if (!rule.color && !rule.background_color && !rule.blink_ms) {
      return `Colour rule ${index + 1} of ${label} paints nothing: give it a colour, a background or a blink.`
    }
  }
  return findContentError(device, effect, label)
}
