import {
  FIELD_RANGES,
  LED_CHIP_VALUES,
  LED_PALETTE_SIZE,
  LED_SEGMENT_DIRECTION_VALUES,
  MATRIX_ORDER_VALUES,
  MATRIX_ORIGIN_VALUES,
  MAXIMUM_HARDWARE_DEVICES,
  MAXIMUM_LEDS_PER_OUTPUT,
  MAXIMUM_LEDS_TOTAL,
  MAXIMUM_LED_EFFECTS,
  MAXIMUM_LED_SEGMENTS,
  MAXIMUM_LED_SPRITES,
  type ApplicationConfiguration,
  type HardwareDeviceConfiguration,
  type LedEffect
} from '../configuration-schema'
import { BOARD_PROFILES, type SimCoreBoardId } from '../device'
import { isMatrix, lampsOf } from '../led-render'
import { badColors, badEnum, badList, findEffectError } from './led-values'
import { findBoundError } from './ranges'

function findListError(device: HardwareDeviceConfiguration, label: string): string | undefined {
  return (
    badList(device.segments, MAXIMUM_LED_SEGMENTS, label, 'runs') ??
    badList(device.sprites, MAXIMUM_LED_SPRITES, label, 'sprites') ??
    badList(device.effects, MAXIMUM_LED_EFFECTS, label, 'layers')
  )
}

function findEnumError(device: HardwareDeviceConfiguration, label: string): string | undefined {
  return (
    badEnum(device.chip, LED_CHIP_VALUES, label, 'chip') ??
    badEnum(device.order, MATRIX_ORDER_VALUES, label, 'order') ??
    badEnum(device.origin, MATRIX_ORIGIN_VALUES, label, 'origin')
  )
}

function findSegmentError(device: HardwareDeviceConfiguration, label: string): string | undefined {
  const segments = device.segments ?? []
  if (segments.length === 0) return undefined
  if (isMatrix(device)) {
    return `${label} is a matrix, whose arrangement is its grid rather than a list of runs.`
  }
  let arranged = 0
  for (const [index, segment] of segments.entries()) {
    const run = `${label} run ${index + 1}`
    const boundError = findBoundError(segment, FIELD_RANGES['LedSegmentConfiguration'], run)
    if (boundError) return boundError
    const enumError = badEnum(segment.direction, LED_SEGMENT_DIRECTION_VALUES, run, 'direction')
    if (enumError) return enumError
    arranged += segment.count ?? 1
  }
  const lamps = device.count ?? 1
  if (arranged !== lamps) {
    return `${label} arranges ${arranged} lamps over its runs, but the strip drives ${lamps}.`
  }
  return undefined
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
    const owner = `Sprite ${JSON.stringify(id)}`
    const boundError = findBoundError(sprite, FIELD_RANGES['LedSpriteConfiguration'], owner)
    if (boundError) return boundError
    const listError = badList(sprite.palette, LED_PALETTE_SIZE, owner, 'palette colours')
    if (listError) return listError
    const colorError = badColors(sprite, owner)
    if (colorError) return colorError
    const palette = sprite.palette ?? []
    if (palette.length === 0) return `${owner} names no palette colours.`
    const pixels = sprite.pixels ?? ''
    const expected = (sprite.width ?? 8) * (sprite.height ?? 8) * (sprite.frame_count ?? 1)
    if (pixels.length !== expected) {
      return `${owner} carries ${pixels.length} pixel digits; its geometry needs ${expected}.`
    }
    for (const digit of pixels) {
      if (!Number.isInteger(Number.parseInt(digit, 16))) {
        return `${owner} carries ${JSON.stringify(digit)}, which is not a hexadecimal pixel digit.`
      }
    }
  }
  return undefined
}

function labelOfEffect(effect: LedEffect, index: number, label: string): string {
  const layer = effect?.id ? `Layer ${JSON.stringify(effect.id)}` : `Layer ${index + 1}`
  return `${layer} of ${label}`
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
    const label = device?.id ? `Device ${JSON.stringify(device.id)}` : `Device ${index + 1}`
    if (device?.type === undefined) {
      return `${label} names no "type", so nothing says which peripheral it is.`
    }
    if (device.type !== 'rgb_strip' && device.type !== 'rgb_matrix') {
      return `${label} is a ${JSON.stringify(device.type)} peripheral, which this firmware has no driver for.`
    }
    const listError = findListError(device, label)
    if (listError) return listError
    const enumError = findEnumError(device, label)
    if (enumError) return enumError
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
    const segmentError = findSegmentError(device, label)
    if (segmentError) return segmentError
    const lamps = lampsOf(device)
    if (lamps === 0 || lamps > MAXIMUM_LEDS_PER_OUTPUT) {
      return `${label} drives ${lamps} lamps; one device carries at most ${MAXIMUM_LEDS_PER_OUTPUT}.`
    }
    const spriteError = findSpriteError(device, label)
    if (spriteError) return spriteError
    for (const [order, effect] of (device.effects ?? []).entries()) {
      const effectError = findEffectError(device, effect, labelOfEffect(effect, order, label))
      if (effectError) return effectError
    }
    total += lamps
  }
  if (total > MAXIMUM_LEDS_TOTAL) {
    return `The configuration drives ${total} lamps; a board carries at most ${MAXIMUM_LEDS_TOTAL}.`
  }
  return undefined
}
