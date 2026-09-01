import {
  MAXIMUM_HARDWARE_DEVICES,
  MAXIMUM_LED_SPRITES,
  type HardwareDeviceConfiguration,
  type HardwareDeviceType,
  type LedEffect
} from '@shared/configuration-schema'
import type { ProfileParts } from './profile-types'
import {
  BOARD_PROFILES,
  type DeviceConfiguration,
  type SimCoreBoardId
} from '@shared/device'
import { mutateDraftConfiguration } from '@/features/configuration/dashboard-editor'

export function devicesOf(
  draft: DeviceConfiguration | undefined
): readonly HardwareDeviceConfiguration[] {
  return draft?.hardware ?? []
}

export function ledPinsOf(draft: DeviceConfiguration | undefined): readonly number[] {
  if (!draft) return []
  return BOARD_PROFILES[draft.board as SimCoreBoardId]?.led.pins ?? []
}

export function freePins(
  draft: DeviceConfiguration | undefined,
  self: number
): readonly number[] {
  const taken = new Set(
    devicesOf(draft)
      .map((device, index) => (index === self ? -1 : (device.pin ?? -1)))
      .filter((pin) => pin >= 0)
  )
  return ledPinsOf(draft).filter((pin) => !taken.has(pin))
}

export function mutateDevices(
  mutation: (devices: HardwareDeviceConfiguration[]) => void
): void {
  mutateDraftConfiguration((configuration) => {
    const devices = [...(configuration.hardware ?? [])]
    mutation(devices)
    if (devices.length === 0) delete configuration.hardware
    else configuration.hardware = devices
  })
}

export function mutateDevice(
  index: number,
  mutation: (device: HardwareDeviceConfiguration) => void
): void {
  mutateDevices((devices) => {
    const device = devices[index]
    if (!device) return
    const next = structuredClone(device)
    mutation(next)
    devices[index] = next
  })
}

export function maximumOutputsOf(draft: DeviceConfiguration | undefined): number {
  const outputs = draft
    ? BOARD_PROFILES[draft.board as SimCoreBoardId]?.led.outputs
    : undefined
  return Math.min(outputs ?? MAXIMUM_HARDWARE_DEVICES, MAXIMUM_HARDWARE_DEVICES)
}

export function canAddDevice(draft: DeviceConfiguration | undefined): boolean {
  return devicesOf(draft).length < maximumOutputsOf(draft) && freePins(draft, -1).length > 0
}

export function addDevice(
  draft: DeviceConfiguration | undefined,
  type: HardwareDeviceType
): number {
  const pin = freePins(draft, -1)[0]
  if (pin === undefined) return -1
  const at = devicesOf(draft).length
  mutateDevices((devices) => {
    devices.push(
      type === 'rgb_matrix'
        ? { type, pin, width: 8, height: 8, effects: [] }
        : { type, pin, count: 16, effects: [] }
    )
  })
  return at
}

export function removeDevice(index: number): void {
  mutateDevices((devices) => {
    devices.splice(index, 1)
  })
}

export function mutateEffects(
  device: number,
  mutation: (effects: LedEffect[]) => void
): void {
  mutateDevice(device, (entry) => {
    const effects = [...(entry.effects ?? [])]
    mutation(effects)
    entry.effects = effects
  })
}

export function addProfile(device: number, parts: ProfileParts): void {
  mutateDevice(device, (entry) => {
    entry.effects = [...(entry.effects ?? []), ...parts.effects]
    const added = parts.sprites ?? []
    if (added.length === 0) return
    const kept = (entry.sprites ?? []).filter(
      (sprite) => !added.some((entry) => entry.id === sprite.id)
    )
    entry.sprites = [...kept, ...added].slice(0, MAXIMUM_LED_SPRITES)
  })
}

export function moveEffect(device: number, from: number, to: number): void {
  mutateEffects(device, (effects) => {
    const moved = effects[from]
    if (!moved || to < 0 || to >= effects.length) return
    effects.splice(from, 1)
    effects.splice(to, 0, moved)
  })
}
