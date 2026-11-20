import type { DeviceConfiguration } from '@shared/device'

export function formatConfiguration(configuration: DeviceConfiguration): string {
  return JSON.stringify(configuration, null, 2)
}

export function draftText(state: { draft?: DeviceConfiguration }): string {
  return state.draft ? formatConfiguration(state.draft) : ''
}
