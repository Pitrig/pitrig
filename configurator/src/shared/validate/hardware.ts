import {
  FIELD_RANGES,
  MAXIMUM_HARDWARE_DEVICES,
  MAXIMUM_LEDS_PER_OUTPUT,
  MAXIMUM_LEDS_TOTAL,
  type ApplicationConfiguration,
  type HardwareDeviceConfiguration,
  type LedEffect
} from '../configuration-schema'
import {
  LED_EFFECT_DRAWS_PIXELS,
  LED_EFFECT_NEEDS_VALUE,
  LED_EFFECT_READS_VALUE,
  isMatrix,
  lampsOf
} from '../led-render'
import { BOARD_PROFILES, type SimCoreBoardId } from '../device'
import { findBoundError } from './ranges'

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

function findEffectError(
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  label: string
): string | undefined {
  const rangeError = findBoundError(effect, FIELD_RANGES['LedEffect'], label)
  if (rangeError) return rangeError
  const lamps = lampsOf(device)
  const from = effect.from ?? 0
  const count = effect.count ?? 0
  if (from >= lamps || (count !== 0 && from + count > lamps)) {
    return `${label} covers lamps ${from} to ${from + count} of a device that has ${lamps}.`
  }
  const type = effect.type ?? 'solid'
  if (LED_EFFECT_DRAWS_PIXELS.has(type) && !isMatrix(device)) {
    return `${label} is a ${type} layer, which needs a matrix rather than a strip.`
  }
  if ((effect.source?.modifiers ?? []).length > 0 || (effect.condition_source?.modifiers ?? []).length > 0) {
    return `${label} carries a source modifier, which an LED layer cannot apply.`
  }
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

function findSpriteError(device: HardwareDeviceConfiguration, label: string): string | undefined {
  const sprites = device.sprites ?? []
  if (sprites.length > 0 && !isMatrix(device)) {
    return `${label} is a strip, so it has nothing to draw a sprite on.`
  }
  const seen = new Set<string>()
  for (const sprite of sprites) {
    const id = sprite.id ?? ''
    if (!id) return `${label} carries a sprite with no id.`
    if (seen.has(id)) return `${label} carries two sprites named ${JSON.stringify(id)}.`
    seen.add(id)
    const boundError = findBoundError(
      sprite,
      FIELD_RANGES['LedSpriteConfiguration'],
      `Sprite ${JSON.stringify(id)}`
    )
    if (boundError) return boundError
    const palette = sprite.palette ?? []
    if (palette.length === 0) return `Sprite ${JSON.stringify(id)} names no palette colours.`
    const pixels = sprite.pixels ?? ''
    const expected = (sprite.width ?? 8) * (sprite.height ?? 8) * (sprite.frame_count ?? 1)
    if (pixels.length !== expected) {
      return `Sprite ${JSON.stringify(id)} carries ${pixels.length} pixel digits; its geometry needs ${expected}.`
    }
    for (const digit of pixels) {
      if (!Number.isInteger(Number.parseInt(digit, 16))) {
        return `Sprite ${JSON.stringify(id)} carries ${JSON.stringify(digit)}, which is not a hexadecimal pixel digit.`
      }
    }
  }
  return undefined
}

export function findHardwareError(
  configuration: ApplicationConfiguration
): string | undefined {
  const devices = configuration.hardware
  if (devices === undefined) return undefined
  if (!Array.isArray(devices)) return 'The hardware section must be a list of peripherals.'
  const profile = BOARD_PROFILES[configuration.board as SimCoreBoardId]
  const outputs = Math.min(profile?.led.outputs ?? MAXIMUM_HARDWARE_DEVICES, MAXIMUM_HARDWARE_DEVICES)
  if (devices.length > outputs) {
    return `The configuration declares ${devices.length} devices; this board drives at most ${outputs}, one transmit channel each.`
  }
  const pins = new Set<number>()
  let total = 0
  for (const [index, device] of devices.entries()) {
    const label = device.id ? `Device ${JSON.stringify(device.id)}` : `Device ${index + 1}`
    if (device.type !== 'rgb_strip' && device.type !== 'rgb_matrix') {
      return `${label} is a ${JSON.stringify(device.type)} peripheral, which this firmware has no driver for.`
    }
    const boundError = findBoundError(device, FIELD_RANGES['HardwareDeviceConfiguration'], label)
    if (boundError) return boundError
    const pin = device.pin ?? -1
    if (profile && !profile.led.pins.includes(pin)) {
      return profile.led.pins.length === 0
        ? `${label} names pin ${pin}, but this board publishes no free pins for LEDs yet.`
        : `${label} names pin ${pin}; this board offers ${profile.led.pins.join(', ')}.`
    }
    if (pins.has(pin)) return `Two devices are wired to pin ${pin}.`
    pins.add(pin)
    if (isMatrix(device) && (device.rotation_deg ?? 0) % 90 !== 0) {
      return `${label} is rotated by ${device.rotation_deg}°; only 0, 90, 180 and 270 are quarter turns.`
    }
    const lamps = lampsOf(device)
    if (lamps === 0 || lamps > MAXIMUM_LEDS_PER_OUTPUT) {
      return `${label} drives ${lamps} lamps; one device carries at most ${MAXIMUM_LEDS_PER_OUTPUT}.`
    }
    const spriteError = findSpriteError(device, label)
    if (spriteError) return spriteError
    for (const effect of device.effects ?? []) {
      const effectError = findEffectError(device, effect, label)
      if (effectError) return effectError
    }
    total += lamps
  }
  if (total > MAXIMUM_LEDS_TOTAL) {
    return `The configuration drives ${total} lamps; a board carries at most ${MAXIMUM_LEDS_TOTAL}.`
  }
  return undefined
}
