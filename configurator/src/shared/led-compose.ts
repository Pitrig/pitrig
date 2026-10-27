import type {
  ConditionOperator,
  HardwareDeviceConfiguration,
  LedEffect,
  RgbColor
} from './configuration-schema'
import { conditionHolds, newRuleState, type LedRuleState } from './led-colors'
import { paintOutput } from './led-paint'

export interface LayerState {
  holding: boolean
  startedMs: number
  holdUntilMs: number
  rules: LedRuleState
}

export interface LayerDrive {
  watched?: number
  value?: number
  valueText?: string
}

export interface ComposeInput {
  nowMs: number
  idle: boolean
  drives: readonly LayerDrive[]
}

export interface Composition {
  frame: RgbColor[]
  order: readonly number[]
}

export function newLayerState(): LayerState {
  return { holding: false, startedMs: 0, holdUntilMs: 0, rules: newRuleState() }
}

function holdsWithin(
  op: ConditionOperator | undefined,
  value: number,
  threshold: number,
  margin: number
): boolean {
  switch (op ?? 'at_or_above') {
    case 'above':
      return value > threshold - margin
    case 'at_or_above':
      return value >= threshold - margin
    case 'below':
      return value < threshold + margin
    case 'at_or_below':
      return value <= threshold + margin
    default:
      return conditionHolds(op, value, threshold)
  }
}

function gateMatches(
  effect: LedEffect,
  watched: number | undefined,
  idle: boolean,
  margin: number
): boolean {
  switch (effect.gate ?? 'always') {
    case 'always':
      return true
    case 'telemetry_idle':
      return idle
    default:
      return (
        watched !== undefined &&
        (effect.conditions ?? []).some((rule) =>
          holdsWithin(rule.op, watched, rule.value ?? 0, margin)
        )
      )
  }
}

export function gateHolds(
  effect: LedEffect,
  watched: number | undefined,
  state: LayerState,
  nowMs: number,
  idle: boolean
): boolean {
  if (gateMatches(effect, watched, idle, state.holding ? (effect.hysteresis ?? 0) : 0)) {
    if (!state.holding) {
      state.holding = true
      state.startedMs = nowMs
    }
    state.holdUntilMs = nowMs + (effect.hold_ms ?? 0)
    return true
  }
  if (state.holding && nowMs < state.holdUntilMs) return true
  state.holding = false
  return false
}

function orderByActivation(order: number[], states: readonly LayerState[]): number[] {
  for (let slot = 1; slot < order.length; ++slot) {
    const index = order[slot] as number
    const started = states[index]?.startedMs ?? 0
    let place = slot
    while (place > 0 && (states[order[place - 1] as number]?.startedMs ?? 0) > started) {
      order[place] = order[place - 1] as number
      --place
    }
    order[place] = index
  }
  return order
}

export function composeOutput(
  device: HardwareDeviceConfiguration,
  input: ComposeInput,
  states: LayerState[]
): Composition {
  const effects = device.effects ?? []
  while (states.length < effects.length) states.push(newLayerState())
  states.length = effects.length
  const active: number[] = []
  for (const [index, effect] of effects.entries()) {
    const state = states[index] as LayerState
    if (gateHolds(effect, input.drives[index]?.watched, state, input.nowMs, input.idle)) {
      active.push(index)
    }
  }
  const order = orderByActivation(active, states)
  const frame = paintOutput(
    { ...device, effects: order.map((index) => effects[index] as LedEffect) },
    {
      elapsedMs: input.nowMs,
      gates: order.map(() => true),
      watched: order.map((index) => input.drives[index]?.watched),
      values: order.map((index) => input.drives[index]?.value),
      valueText: order.map((index) => input.drives[index]?.valueText),
      states: order.map((index) => (states[index] as LayerState).rules),
      startedMs: order.map((index) => (states[index] as LayerState).startedMs)
    }
  )
  return { frame, order }
}
