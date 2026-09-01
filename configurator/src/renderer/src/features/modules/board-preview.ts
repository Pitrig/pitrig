import type { LedEffect } from '@shared/configuration-schema'
import type { DeviceConfiguration } from '@shared/device'

export function soloConfiguration(
  draft: DeviceConfiguration,
  output: number,
  effect: number
): DeviceConfiguration | undefined {
  const devices = draft.hardware ?? []
  const device = devices[output]
  const layer = (device?.effects ?? [])[effect]
  if (!device || !layer) return undefined
  const solo: LedEffect = { ...layer, gate: 'always' }
  delete solo.condition_source
  delete solo.conditions
  delete solo.hold_ms
  return {
    ...draft,
    hardware: devices.map((entry, index) =>
      index === output ? { ...entry, effects: [solo] } : entry
    )
  }
}
