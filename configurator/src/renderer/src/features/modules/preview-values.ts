import type { LedColorRule, LedEffect } from '@shared/configuration-schema'

const GEAR_BINDINGS = new Set(['transmission.gear', 'transmission.gear_number'])
const GEARS: readonly string[] = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const GEAR_STEP_MS = 700
const RULE_STEP_MS = 1500
const NUDGE = 0.001

export interface PreviewDrive {
  valueText?: string
  watched?: number
}

function gearText(effect: LedEffect, elapsedMs: number): string | undefined {
  const binding = effect.source?.binding ?? ''
  if ((effect.type ?? 'solid') !== 'text' || !GEAR_BINDINGS.has(binding)) return undefined
  const step = Math.floor(elapsedMs / GEAR_STEP_MS) % GEARS.length
  return binding === 'transmission.gear_number' ? String(step - 1) : GEARS[step]
}

function matchingValue(rule: LedColorRule): number {
  const value = rule.value ?? 0
  switch (rule.op ?? 'at_or_above') {
    case 'above':
      return value + NUDGE
    case 'below':
      return value - NUDGE
    case 'not_equal':
      return value + 1
    default:
      return value
  }
}

function watchedValue(effect: LedEffect, elapsedMs: number): number | undefined {
  const rules = effect.color_rules ?? []
  if (rules.length === 0) return undefined
  const step = Math.floor(elapsedMs / RULE_STEP_MS) % (rules.length + 1)
  const rule = rules[step - 1]
  if (rule) return matchingValue(rule)
  const held = rules[rules.length - 1]
  const since = elapsedMs % RULE_STEP_MS
  return held && since < (held.hold_ms ?? 0) ? matchingValue(held) : undefined
}

export function previewDrive(effect: LedEffect, elapsedMs: number): PreviewDrive {
  return { valueText: gearText(effect, elapsedMs), watched: watchedValue(effect, elapsedMs) }
}

export function previewNote(effect: LedEffect): string {
  const gear = gearText(effect, 0) !== undefined
  const rules = (effect.color_rules ?? []).length > 0
  if (gear && rules) {
    return ' The gear steps from reverse up to ninth, and every colour rule is held in turn.'
  }
  if (gear) return ' The gear steps from reverse up to ninth.'
  if (rules) return ' Every colour rule is held in turn, and then none of them.'
  return ''
}
