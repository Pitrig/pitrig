import type { LedEffect, LedSpriteConfiguration } from '@shared/configuration-schema'

export interface LampRange {
  from: number
  count: number
}

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
  build: (range: LampRange, lamps: number, matrix?: MatrixSize) => ProfileParts
}

export function area({ from, count }: LampRange): Partial<LedEffect> {
  return {
    ...(from > 0 ? { from } : {}),
    ...(count > 0 ? { count } : {})
  }
}

export function whenTrue(binding: string): Partial<LedEffect> {
  return {
    gate: 'conditions',
    condition_source: { binding },
    conditions: [{ op: 'equal', value: 1 }]
  }
}
