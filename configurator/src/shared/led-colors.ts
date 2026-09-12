import type { ConditionOperator, LedEffect, RgbColor } from './configuration-schema'

export interface LayerColors {
  ink: RgbColor
  tint?: RgbColor
  background?: RgbColor
  blinkMs?: number
  sinceMs?: number
}

export interface LedRuleState {
  applied: number
  startedMs: number
  holdUntilMs: number
}

export function newRuleState(): LedRuleState {
  return { applied: -1, startedMs: 0, holdUntilMs: 0 }
}

export function conditionHolds(
  op: ConditionOperator | undefined,
  value: number,
  threshold: number
): boolean {
  switch (op ?? 'at_or_above') {
    case 'above':
      return value > threshold
    case 'at_or_above':
      return value >= threshold
    case 'below':
      return value < threshold
    case 'at_or_below':
      return value <= threshold
    case 'equal':
      return value === threshold
    default:
      return value !== threshold
  }
}

function matchingRule(effect: LedEffect, watched: number | undefined): number {
  if (watched === undefined) return -1
  for (const [index, rule] of (effect.color_rules ?? []).entries()) {
    if (conditionHolds(rule.op, watched, rule.value ?? 0)) return index
  }
  return -1
}

function appliedRule(
  effect: LedEffect,
  watched: number | undefined,
  state: LedRuleState,
  nowMs: number
): number {
  const rules = effect.color_rules ?? []
  let applied = matchingRule(effect, watched)
  if (applied >= 0) {
    state.holdUntilMs = nowMs + (rules[applied]?.hold_ms ?? 0)
  } else if (state.applied >= 0 && state.applied < rules.length && nowMs < state.holdUntilMs) {
    applied = state.applied
  }
  if (applied !== state.applied) {
    state.applied = applied
    state.startedMs = nowMs
  }
  return applied
}

export function colorsOf(
  effect: LedEffect,
  watched: number | undefined,
  state: LedRuleState,
  nowMs: number
): LayerColors {
  const colors: LayerColors = { ink: effect.color ?? '#ffffff' }
  if (effect.background_color) colors.background = effect.background_color
  const applied = appliedRule(effect, watched, state, nowMs)
  const rule = (effect.color_rules ?? [])[applied]
  if (applied < 0 || !rule) return colors
  if (rule.color) {
    colors.tint = rule.color
    colors.ink = rule.color
  }
  if (rule.background_color) colors.background = rule.background_color
  if (rule.blink_ms) colors.blinkMs = rule.blink_ms
  colors.sinceMs = state.startedMs
  return colors
}
