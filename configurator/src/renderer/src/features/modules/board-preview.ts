import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'
import type { PreviewTarget } from './modules-store'

export interface PlayedLayer {
  target: PreviewTarget
  layer: LedEffect
}

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

export function playedLayersOf(
  device: HardwareDeviceConfiguration,
  targets: readonly PreviewTarget[]
): PlayedLayer[] {
  return targets.flatMap((target) => {
    const layer = previewLayerOf(device, target)
    return layer ? [{ target, layer }] : []
  })
}

export function previewConfiguration(
  draft: DeviceConfiguration,
  targets: readonly PreviewTarget[]
): DeviceConfiguration | undefined {
  const output = targets[0]?.output
  if (output === undefined) return undefined
  const devices = draft.hardware ?? []
  const device = devices[output]
  const played = device
    ? playedLayersOf(device, targets.filter((target) => target.output === output))
    : []
  if (played.length === 0) return undefined
  return {
    ...draft,
    hardware: devices.map((entry, index) =>
      index === output ? { ...entry, effects: played.map(({ layer }) => layer) } : entry
    )
  }
}
