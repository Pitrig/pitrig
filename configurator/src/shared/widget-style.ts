import { rampColor } from './color-ramp'
import type { ConditionOperator, RgbColor, WidgetCondition } from './configuration-schema'
import { deviceFloat } from './contract-number'

export interface StyledFrame {
  id?: string
  background_color?: RgbColor
  border?: { color?: RgbColor }
  condition_source?: { binding?: string }
  conditions?: WidgetCondition[]
  color_ramp?: { target?: 'content' | 'background' | 'border'; stops?: { at?: number; color?: RgbColor }[] }
}

export interface AuthoredStyle {
  color?: RgbColor
  backgroundColor?: RgbColor
  borderColor?: RgbColor
}

export interface ResolvedStyle extends AuthoredStyle {
  hidden: boolean
  blinkMs: number
}

export function resolveWidgetStyle(
  frame: StyledFrame,
  authored: AuthoredStyle,
  value: number | undefined
): ResolvedStyle {
  const style: ResolvedStyle = { ...authored, hidden: false, blinkMs: 0 }

  const ramp = rampColor(frame.color_ramp?.stops, value)
  if (ramp) {
    const target = frame.color_ramp?.target ?? 'content'
    if (target === 'content') style.color = ramp
    else if (target === 'background') style.backgroundColor = ramp
    else style.borderColor = ramp
  }

  const rule = matchedCondition(frame, value)
  if (rule) {
    if (rule.color) style.color = rule.color
    if (rule.background_color) style.backgroundColor = rule.background_color
    if (rule.border_color) style.borderColor = rule.border_color
    style.hidden = rule.hidden ?? false
    style.blinkMs = rule.blink_ms ?? 0
  }
  return style
}

export function matchedCondition(
  frame: StyledFrame,
  value: number | undefined
): WidgetCondition | undefined {
  if (value === undefined) return undefined
  return (frame.conditions ?? []).find((rule) =>
    holds(rule.op ?? 'at_or_above', value, deviceFloat(rule.value ?? 0))
  )
}

export function blinkVisible(style: ResolvedStyle, elapsedMs: number): boolean {
  if (style.hidden) return false
  if (style.blinkMs <= 0) return true
  return elapsedMs % style.blinkMs < style.blinkMs / 2
}

function holds(operator: ConditionOperator, value: number, threshold: number): boolean {
  switch (operator) {
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
    case 'not_equal':
      return value !== threshold
  }
}
