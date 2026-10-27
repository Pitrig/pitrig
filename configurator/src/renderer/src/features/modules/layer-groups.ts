import type { LedEffect } from '@shared/configuration-schema'
import { LED_EFFECT_READS_VALUE } from '@shared/led-render'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { t } from '@shared/ui-text'

export interface LayerGroup {
  key: string
  label: string
  indices: readonly number[]
}

interface Category {
  key: string
  label: string
}

function categoryOfBinding(binding: string | undefined): Category | undefined {
  if (!binding) return undefined
  const entry = TELEMETRY_CATALOG.find(({ name }) => name === binding)
  return entry ? { key: entry.category, label: entry.categoryLabel } : undefined
}

export function categoryOf(effect: LedEffect): Category {
  const gate = effect.gate ?? 'always'
  if (gate === 'telemetry_idle') {
    return { key: 'telemetry_idle', label: t('modules.layerGroups.whenTelemetryStops') }
  }
  const watched = gate === 'conditions' ? categoryOfBinding(effect.condition_source?.binding) : undefined
  const read = LED_EFFECT_READS_VALUE.has(effect.type ?? 'solid')
    ? categoryOfBinding(effect.source?.binding)
    : undefined
  return watched ?? read ?? { key: 'always', label: t('modules.layerGroups.alwaysOn') }
}

export function groupLayers(effects: readonly LedEffect[]): LayerGroup[] {
  const groups: LayerGroup[] = []
  let current: { key: string; label: string; indices: number[] } | undefined
  for (const [index, effect] of effects.entries()) {
    const category = categoryOf(effect)
    if (current && current.key === category.key) {
      current.indices.push(index)
      continue
    }
    current = { key: category.key, label: category.label, indices: [index] }
    groups.push(current)
  }
  return groups.map((group) => ({ ...group, key: `${group.key}@${group.indices[0] ?? 0}` }))
}
