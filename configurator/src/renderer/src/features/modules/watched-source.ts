import type { LedEffect } from '@shared/configuration-schema'
import { TELEMETRY_CATALOG } from '@shared/telemetry-catalog'
import { BOOLEAN_OPERATORS } from '@shared/widget-conditions'

export function applyWatchedBinding(effect: LedEffect, binding: string): void {
  if (binding) effect.condition_source = { ...effect.condition_source, binding }
  else delete effect.condition_source
  const selected = TELEMETRY_CATALOG.find(({ name }) => name === binding)
  if (selected?.type !== 'boolean') return
  if (effect.conditions) {
    effect.conditions = effect.conditions.map((rule) => ({
      ...rule,
      op: BOOLEAN_OPERATORS.includes(rule.op ?? 'at_or_above') ? rule.op : 'equal',
      value: (rule.value ?? 0) >= 1 ? 1 : 0
    }))
  }
  if (effect.color_rules) {
    effect.color_rules = effect.color_rules.map((rule) => ({
      ...rule,
      op: BOOLEAN_OPERATORS.includes(rule.op ?? 'at_or_above') ? rule.op : 'equal',
      value: (rule.value ?? 0) >= 1 ? 1 : 0
    }))
  }
}

export function releaseWatchedBinding(effect: LedEffect): void {
  if (effect.gate === 'conditions' || (effect.color_rules ?? []).length > 0) return
  delete effect.condition_source
}
