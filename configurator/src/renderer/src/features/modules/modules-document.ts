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
import {
  deviceShape,
  drawnSize,
  lampsOf,
  maskDigits,
  readMask,
  writeMask
} from '@shared/led-render'
import { mutateDraftConfiguration } from '@/features/configuration/dashboard-editor'

export interface DrawnSize {
  width: number
  height: number
}

export function drawnOf(device: HardwareDeviceConfiguration): DrawnSize {
  return drawnSize(deviceShape(device))
}

function rotateGrid(
  chosen: readonly boolean[],
  size: DrawnSize,
  turns: number
): { chosen: boolean[]; size: DrawnSize } {
  if (turns === 0) return { chosen: [...chosen], size }
  let grid = [...chosen]
  let shape = size
  for (let turn = 0; turn < turns; ++turn) {
    const next: boolean[] = []
    for (let row = 0; row < shape.width; ++row) {
      for (let column = 0; column < shape.height; ++column) {
        next.push(grid[(shape.height - 1 - column) * shape.width + row] ?? false)
      }
    }
    grid = next
    shape = { width: shape.height, height: shape.width }
  }
  return { chosen: grid, size: shape }
}

function resizeGrid(
  chosen: readonly boolean[],
  before: DrawnSize,
  after: DrawnSize
): boolean[] {
  const next: boolean[] = []
  for (let row = 0; row < after.height; ++row) {
    for (let column = 0; column < after.width; ++column) {
      const inside = row < before.height && column < before.width
      next.push(inside ? (chosen[row * before.width + column] ?? false) : false)
    }
  }
  return next
}

function carryMask(
  effect: LedEffect,
  before: DrawnSize,
  after: DrawnSize,
  turns: number
): void {
  const mask = effect.panel_mask
  if (!mask || mask.length !== maskDigits(before.width * before.height)) return
  const turned = rotateGrid(readMask(mask, before.width * before.height), before, turns)
  const chosen = resizeGrid(turned.chosen, turned.size, after)
  if (chosen.every(Boolean)) {
    delete effect.panel_mask
    return
  }
  if (!chosen.some(Boolean)) chosen[0] = true
  effect.panel_mask = writeMask(chosen)
}

function carryArea(effect: LedEffect, lamps: number): void {
  if (effect.from !== undefined) {
    effect.from = Math.min(effect.from, Math.max(0, lamps - 1))
  }
  const from = effect.from ?? 0
  const count = effect.count ?? 0
  if (count !== 0 && from + count > lamps) effect.count = Math.max(1, lamps - from)
}

export function carryGeometry(
  device: HardwareDeviceConfiguration,
  before: DrawnSize,
  turns: number
): void {
  const after = drawnOf(device)
  if (after.width === 0 || after.height === 0) return
  if (before.width === 0 || before.height === 0) return
  const lamps = lampsOf(device)
  for (const effect of device.effects ?? []) {
    carryMask(effect, before, after, turns)
    carryArea(effect, lamps)
  }
}

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
