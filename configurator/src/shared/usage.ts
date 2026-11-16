export const USAGE_GET_CHANNEL = 'usage:get' as const
export const USAGE_SET_CHANNEL = 'usage:set' as const

export interface UsageSettings {
  active: boolean
  enabled: boolean
}

export interface UsageSetRequest {
  enabled: boolean
}

export type UsageEvent = 'launch' | 'board' | 'save' | 'firmware' | 'bridge' | 'crash'

export interface UsageReport {
  install: string
  event: UsageEvent
  version: string
  os: string
  arch: string
  board?: string
  detail?: string
}
