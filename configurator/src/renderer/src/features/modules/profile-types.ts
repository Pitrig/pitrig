import type { LedEffect, LedPart, LedSpriteConfiguration } from '@shared/configuration-schema'

export type LampSet = readonly LedPart[] | undefined

export interface MatrixSize {
  width: number
  height: number
}

export interface ProfileParts {
  effects: LedEffect[]
  sprites?: LedSpriteConfiguration[]
}

export interface LedProfile {
  id: string
  label: string
  description: string
  panelOnly?: boolean
  build: (zone: LampSet, lamps: number, matrix?: MatrixSize) => ProfileParts
}

export const COVER_BELOW: Partial<LedEffect> = { background_color: '#000000' }

export function area(zone: LampSet): Partial<LedEffect> {
  if (!zone || zone.length === 0) return {}
  return {
    parts: zone.map((part) => ({ ...part })),
    ...(zone.length > 1 ? { layout: 'each' as const } : {})
  }
}

export function whenTrue(binding: string): Partial<LedEffect> {
  return {
    gate: 'conditions',
    condition_source: { binding },
    conditions: [{ op: 'equal', value: 1 }]
  }
}
