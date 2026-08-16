import { rampColor } from './color-ramp'
import type { ConditionOperator, RgbColor, WidgetCondition } from './configuration-schema'

// What a widget ends up looking like once its watched value is known. This
// mirrors `frame::Painter::render` and `conditions::resolve`, and the layering
// is the whole point of it:
//
//   authored style  →  colour ramp  →  the first rule that holds
//
// The ramp replaces the colour the rules fall back to, so a matching rule paints
// over it and a non-matching frame leaves a colour that moved with the value.
//
// Hold is deliberately not reproduced. It exists so a momentary trigger stays
// visible after it stops being true, which is a fact about a sequence of
// readings; a preview that can be scrubbed to any point has no such sequence.

/** The frame properties this resolver reads, in the shape the schema stores. */
export interface StyledFrame {
  background_color?: RgbColor
  border?: { color?: RgbColor }
  condition_source?: { binding?: string }
  conditions?: WidgetCondition[]
  color_ramp?: { target?: 'content' | 'background' | 'border'; stops?: { at?: number; color?: RgbColor }[] }
}

export interface AuthoredStyle {
  /** What "content" means is the widget type's own business: a label, a fill, a line. */
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

  if (value === undefined) return style
  for (const rule of frame.conditions ?? []) {
    if (!holds(rule.op ?? 'at_or_above', value, rule.value ?? 0)) continue
    // A rule overrides only what it names; everything else stays as the ramp or
    // the author left it.
    if (rule.color) style.color = rule.color
    if (rule.background_color) style.backgroundColor = rule.background_color
    if (rule.border_color) style.borderColor = rule.border_color
    style.hidden = rule.hidden ?? false
    style.blinkMs = rule.blink_ms ?? 0
    break
  }
  return style
}

/** Whether the widget is drawn on this frame, given its blink phase. */
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
