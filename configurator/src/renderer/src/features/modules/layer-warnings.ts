import type { HardwareDeviceConfiguration, LedEffect } from '@shared/configuration-schema'
import { contains, coverageOf, overlaps } from './layer-lamps'
import { layerName } from './layer-name'
import { layerShape } from './layer-shape'
import { t } from '@shared/ui-text'

export type LayerWarning =
  | { kind: 'no_lamps' }
  | { kind: 'duplicate'; of: number }
  | { kind: 'hidden'; under: number }
  | { kind: 'shows_through'; below: readonly number[] }

const GAPPED_ANIMATIONS: ReadonlySet<string> = new Set(['chase', 'scan', 'wipe', 'pulse'])

export function flashes(effect: LedEffect): boolean {
  return (
    (effect.blink_ms ?? 0) > 0 ||
    (effect.color_rules ?? []).some((rule) => (rule.blink_ms ?? 0) > 0)
  )
}

export function leavesGaps(effect: LedEffect): boolean {
  if (flashes(effect)) return true
  return (effect.type ?? 'solid') === 'animation' && GAPPED_ANIMATIONS.has(effect.animation ?? 'rainbow')
}

function paintsEveryLamp(effect: LedEffect): boolean {
  if (effect.background_color) return true
  const type = effect.type ?? 'solid'
  if (type === 'solid' || type === 'gradient') return true
  return type === 'animation' && (effect.animation ?? 'rainbow') === 'rainbow'
}

const NAMELESS: ReadonlySet<string> = new Set(['id'])

function always(effect: LedEffect): boolean {
  return (effect.gate ?? 'always') === 'always'
}

export function layerWarnings(device: HardwareDeviceConfiguration): LayerWarning[][] {
  const effects = device.effects ?? []
  const coverage = coverageOf(device)
  const shapes = effects.map((effect) => layerShape(effect, NAMELESS))
  return effects.map((effect, index) => {
    const lamps = coverage[index] ?? new Set<number>()
    const warnings: LayerWarning[] = []
    if (lamps.size === 0) {
      warnings.push({ kind: 'no_lamps' })
      return warnings
    }
    const twin = shapes.findIndex((shape, other) => other < index && shape === shapes[index])
    if (twin >= 0) warnings.push({ kind: 'duplicate', of: twin })
    if (always(effect)) {
      const under = effects.findIndex(
        (other, at) =>
          at > index &&
          always(other) &&
          !flashes(other) &&
          paintsEveryLamp(other) &&
          contains(coverage[at] ?? new Set(), lamps)
      )
      if (under >= 0) warnings.push({ kind: 'hidden', under })
    }
    if (leavesGaps(effect) && !effect.background_color) {
      const below = effects.flatMap((other, at) =>
        at !== index &&
        (other.gate ?? 'always') !== 'telemetry_idle' &&
        overlaps(coverage[at] ?? new Set(), lamps)
          ? [at]
          : []
      )
      if (below.length > 0) warnings.push({ kind: 'shows_through', below })
    }
    return warnings
  })
}

export function warningText(warning: LayerWarning, effects: readonly LedEffect[]): string {
  const name = (index: number): string => layerName(effects[index] ?? {}, index)
  switch (warning.kind) {
    case 'no_lamps':
      return t('modules.layerWarnings.coversNoLamps')
    case 'duplicate':
      return t('modules.layerWarnings.sameAsLayer', { name: name(warning.of) })
    case 'hidden':
      return t('modules.layerWarnings.alwaysHiddenUnder', { name: name(warning.under) })
    case 'shows_through':
      return t('modules.layerWarnings.showsThroughBetweenFlashes', {
        names: [...new Set(warning.below.map(name))].join(', ')
      })
  }
}
