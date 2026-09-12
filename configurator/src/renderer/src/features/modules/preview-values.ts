import type { LedColorRule, LedEffect, ValueTransform } from '@shared/configuration-schema'
import { conditionValue, type TelemetryValue } from '@shared/telemetry-value'
import { transformedBody } from '@shared/value-format'
import { readLiveValue, telemetryIsLive } from '@/features/telemetry/live-telemetry'
import { t } from '@shared/ui-text'

const WHOLE_NUMBER: ValueTransform = { type: 'number' }

const GEAR_BINDINGS = new Set(['transmission.gear', 'transmission.gear_number'])
const GEARS: readonly string[] = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const GEAR_STEP_MS = 700
const RULE_STEP_MS = 1500
const NUDGE = 0.001

export interface PreviewDrive {
  valueText?: string
  watched?: number
  value?: number
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
  if (telemetryIsLive()) return liveDrive(effect)
  return { valueText: gearText(effect, elapsedMs), watched: watchedValue(effect, elapsedMs) }
}

function boardText(value: TelemetryValue): string | undefined {
  if (!value.available) return undefined
  if (value.type === 'text') return value.text
  if (value.type === 'boolean') return value.number ? '1' : '0'
  return transformedBody(WHOLE_NUMBER, value)
}

function liveDrive(effect: LedEffect): PreviewDrive {
  const source = readLiveValue(effect.source?.binding)
  const watched = conditionValue(readLiveValue(effect.condition_source?.binding))
  const shown = boardText(source)
  const value = conditionValue(source)
  return {
    ...(shown === undefined ? {} : { valueText: shown }),
    ...(watched === undefined ? {} : { watched }),
    ...(value === undefined ? {} : { value })
  }
}

export function previewNote(effect: LedEffect): string {
  if (telemetryIsLive()) return t('modules.previewValues.liveValues')
  const gear = gearText(effect, 0) !== undefined
  const rules = (effect.color_rules ?? []).length > 0
  if (gear && rules) {
    return t('modules.previewValues.theGearStepsFromReverse')
  }
  if (gear) return t('modules.previewValues.theGearStepsFromReverse2')
  if (rules) return t('modules.previewValues.everyColourRuleIsHeld')
  return ''
}
