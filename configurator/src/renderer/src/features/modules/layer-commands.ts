import {
  MAXIMUM_LED_EFFECTS,
  MAXIMUM_LED_PARTS,
  type HardwareDeviceConfiguration,
  type LedEffect
} from '@shared/configuration-schema'
import { layerShape } from './layer-shape'
import { growDevice, mutateEffects } from './modules-document'

const LAMPLESS: ReadonlySet<string> = new Set(['id', 'parts', 'layout'])

export function mergeGroups(device: HardwareDeviceConfiguration): number[][] {
  if (device.type !== 'rgb_strip') return []
  const effects = device.effects ?? []
  const groups = new Map<string, number[]>()
  for (const [index, effect] of effects.entries()) {
    const parts = effect.parts ?? []
    if (parts.length === 0) continue
    if (parts.length > 1 && (effect.layout ?? 'joined') !== 'each') continue
    const key = layerShape(effect, LAMPLESS)
    const group = groups.get(key)
    if (group) group.push(index)
    else groups.set(key, [index])
  }
  return [...groups.values()].filter(
    (group) =>
      group.length > 1 &&
      group.reduce((total, index) => total + (effects[index]?.parts?.length ?? 0), 0) <=
        MAXIMUM_LED_PARTS
  )
}

export function mergeLayers(output: number, groups: readonly (readonly number[])[]): void {
  mutateEffects(output, (effects) => {
    const doomed = new Set<number>()
    for (const [keep, ...rest] of groups) {
      const target = keep === undefined ? undefined : effects[keep]
      if (!target) continue
      const seen = new Set<string>()
      target.parts = [keep as number, ...rest]
        .flatMap((index) => effects[index]?.parts ?? [])
        .filter((part) => {
          const key = `${part.from ?? 0}:${part.count ?? 1}:${part.reversed ? 1 : 0}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      target.layout = 'each'
      for (const index of rest) doomed.add(index)
    }
    const kept = effects.filter((_, index) => !doomed.has(index))
    effects.splice(0, effects.length, ...kept)
  })
}

export function duplicateEffects(output: number, indices: readonly number[]): number[] {
  const sorted = [...new Set(indices)].sort((first, second) => first - second)
  const last = sorted.at(-1)
  if (last === undefined) return []
  let copies: number[] = []
  const grown = growDevice(output, (device) => {
    const effects = [...(device.effects ?? [])]
    if (effects.length + sorted.length > MAXIMUM_LED_EFFECTS) return
    const duplicated = sorted.flatMap((index) => {
      const effect = effects[index]
      return effect ? [structuredClone(effect)] : []
    })
    effects.splice(last + 1, 0, ...duplicated)
    device.effects = effects
    copies = duplicated.map((_, offset) => last + 1 + offset)
  })
  return grown ? copies : []
}

export function removeEffects(output: number, indices: readonly number[]): void {
  const doomed = new Set(indices)
  mutateEffects(output, (effects) => {
    const kept = effects.filter((_, index) => !doomed.has(index))
    effects.splice(0, effects.length, ...kept)
  })
}

export function updateEffects(
  output: number,
  indices: readonly number[],
  mutation: (effect: LedEffect) => void
): void {
  const chosen = new Set(indices)
  mutateEffects(output, (effects) => {
    for (const [index, effect] of effects.entries()) {
      if (chosen.has(index)) mutation(effect)
    }
  })
}
