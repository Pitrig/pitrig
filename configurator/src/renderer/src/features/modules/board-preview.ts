import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'
import type { PreviewTarget } from './modules-store'

export function previewLayerOf(
  device: HardwareDeviceConfiguration,
  target: PreviewTarget
): LedEffect | undefined {
  if (target.kind === 'sprite') {
    return (device.sprites ?? []).some((sprite) => sprite.id === target.sprite)
      ? { type: 'sprite', sprite: target.sprite, sprite_loop: true, speed_ms: target.speedMs }
      : undefined
  }
  const layer = (device.effects ?? [])[target.effect]
  if (!layer) return undefined
  const solo: LedEffect = { ...layer, gate: 'always' }
  delete solo.conditions
  delete solo.hold_ms
  if ((solo.color_rules ?? []).length === 0) delete solo.condition_source
  return solo
}

export function soloConfiguration(
  draft: DeviceConfiguration,
  target: PreviewTarget
): DeviceConfiguration | undefined {
  const devices = draft.hardware ?? []
  const device = devices[target.output]
  const solo = device ? previewLayerOf(device, target) : undefined
  if (!solo) return undefined
  return {
    ...draft,
    hardware: devices.map((entry, index) =>
      index === target.output ? { ...entry, effects: [solo] } : entry
    )
  }
}
