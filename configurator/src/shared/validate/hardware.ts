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
import { BOARD_PROFILES, type PitrigBoardId } from '../device'
import { isMatrix, lampsOf } from '../led-render'
import { badColors, badEnum, badList, findEffectError } from './led-values'
import { findBoundError } from './ranges'
import { t } from '../ui-text'

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
    return t('validation.hardware.labelIsAMatrixWhose', { label: label })
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
    return t('validation.hardware.labelArrangesArrangedLampsOver', { label: label, arranged: arranged, lamps: lamps })
  }
  return undefined
}

function findSpriteError(device: HardwareDeviceConfiguration, label: string): string | undefined {
  const sprites = device.sprites ?? []
  if (sprites.length > 0 && !isMatrix(device)) {
    return t('validation.hardware.labelIsAStripSo', { label: label })
  }
  const seen = new Set<string>()
  for (const sprite of sprites) {
    const id = sprite.id ?? ''
    if (!id) return t('validation.hardware.labelCarriesASpriteWith', { label: label })
    if (seen.has(id)) return t('validation.hardware.labelCarriesTwoSpritesNamed', { label: label, id: JSON.stringify(id) })
    seen.add(id)
    const owner = t('validation.hardware.spriteId', { id: JSON.stringify(id) })
    const boundError = findBoundError(sprite, FIELD_RANGES['LedSpriteConfiguration'], owner)
    if (boundError) return boundError
    const listError = badList(sprite.palette, LED_PALETTE_SIZE, owner, t('validation.hardware.paletteColours'))
    if (listError) return listError
    const colorError = badColors(sprite, owner)
    if (colorError) return colorError
    const palette = sprite.palette ?? []
    if (palette.length === 0) return t('validation.hardware.ownerNamesNoPaletteColours', { owner: owner })
    const pixels = sprite.pixels ?? ''
    const expected = (sprite.width ?? 8) * (sprite.height ?? 8) * (sprite.frame_count ?? 1)
    if (pixels.length !== expected) {
      return t('validation.hardware.ownerCarriesLengthPixelDigits', { owner: owner, length: pixels.length, expected: expected })
    }
    for (const digit of pixels) {
      if (!Number.isInteger(Number.parseInt(digit, 16))) {
        return t('validation.hardware.ownerCarriesDigitWhichIs', { owner: owner, digit: JSON.stringify(digit) })
      }
    }
  }
  return undefined
}

function labelOfEffect(effect: LedEffect, index: number, label: string): string {
  const layer = effect?.id ? t('validation.hardware.layerId', { id: JSON.stringify(effect.id) }) : `Layer ${index + 1}`
  return t('validation.hardware.layerOfLabel', { layer: layer, label: label })
}

export function findHardwareError(
  configuration: ApplicationConfiguration
): string | undefined {
  const devices = configuration.hardware
  if (devices === undefined) return undefined
  if (!Array.isArray(devices)) return t('validation.hardware.theHardwareSectionMustBe')
  const profile = BOARD_PROFILES[configuration.board as PitrigBoardId]
  const outputs = Math.min(profile?.led.outputs ?? MAXIMUM_HARDWARE_DEVICES, MAXIMUM_HARDWARE_DEVICES)
  if (devices.length > outputs) {
    return t('validation.hardware.theConfigurationDeclaresLengthDevices', { length: devices.length, outputs: outputs })
  }
  const pins = new Set<number>()
  let total = 0
  for (const [index, device] of devices.entries()) {
    const label = device?.id ? t('validation.hardware.deviceId', { id: JSON.stringify(device.id) }) : `Device ${index + 1}`
    if (device?.type === undefined) {
      return t('validation.hardware.labelNamesNoTypeSo', { label: label })
    }
    if (device.type !== 'rgb_strip' && device.type !== 'rgb_matrix') {
      return t('validation.hardware.labelIsATypePeripheral', { label: label, type: JSON.stringify(device.type) })
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
        ? t('validation.hardware.labelNamesPinPinBut', { label: label, pin: pin })
        : t('validation.hardware.labelNamesPinPinThis', { label: label, pin: pin, join: profile.led.pins.join(', ') })
    }
    if (pins.has(pin)) return t('validation.hardware.twoDevicesAreWiredTo', { pin: pin })
    pins.add(pin)
    if (isMatrix(device) && (device.rotation_deg ?? 0) % 90 !== 0) {
      return t('validation.hardware.labelIsRotatedByRotation', { label: label, rotation_deg: device.rotation_deg ?? 0 })
    }
    const segmentError = findSegmentError(device, label)
    if (segmentError) return segmentError
    const lamps = lampsOf(device)
    if (lamps === 0 || lamps > MAXIMUM_LEDS_PER_OUTPUT) {
      return t('validation.hardware.labelDrivesLampsLampsOne', { label: label, lamps: lamps, mAXIMUM_LEDS_PER_OUTPUT: MAXIMUM_LEDS_PER_OUTPUT })
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
    return t('validation.hardware.theConfigurationDrivesTotalLamps', { total: total, mAXIMUM_LEDS_TOTAL: MAXIMUM_LEDS_TOTAL })
  }
  return undefined
}
