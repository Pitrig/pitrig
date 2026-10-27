import { rampColor } from './color-ramp'
import { rangeFraction } from './telemetry-value'
import { colorsOf, newRuleState, type LayerColors, type LedRuleState } from './led-colors'
import { OFF, isMatrix, lampsOf } from './led-render'
import { paintSprite, paintStripSprite, paintText, panelOf, spriteOf } from './led-matrix-paint'
import { paintAnimation, scaled } from './led-motion'
import { fillLayer, place, surfaceSize, surfacesOf, type Surface } from './led-surface'
import type { HardwareDeviceConfiguration, LedEffect, RgbColor } from './configuration-schema'

const DEFAULT_BRIGHTNESS = 128
const FULL_BRIGHTNESS = 255

export interface PaintInput {
  value?: number
  elapsedMs: number
  gates: readonly boolean[]
  valueText?: readonly (string | undefined)[]
  watched?: readonly (number | undefined)[]
  values?: readonly (number | undefined)[]
  states?: readonly LedRuleState[]
  startedMs?: readonly number[]
}

function rawValueOf(effect: LedEffect, sweep: number): number {
  const minimum = effect.minimum ?? 0
  const maximum = effect.maximum ?? 1
  return minimum + sweep * (maximum - minimum)
}

function valueOf(
  effect: LedEffect,
  live: number | undefined,
  sweep: number | undefined
): number | undefined {
  if ((effect.source?.binding ?? '') === '') return undefined
  return live ?? (sweep === undefined ? undefined : rawValueOf(effect, sweep))
}

function wholeText(value: number): string {
  return String(Math.trunc(value < 0 ? value - 0.5 : value + 0.5))
}

function paintSurface(
  surface: Surface,
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  input: PaintInput,
  colors: LayerColors,
  value: number | undefined
): void {
  const lamps = surfaceSize(surface)
  const color = colors.ink
  const fraction = value === undefined ? 0 : rangeFraction(value, effect.minimum, effect.maximum)
  const period = (effect.speed_ms ?? 1000) || 1000
  const phase = (input.elapsedMs % period) / period

  switch (effect.type ?? 'solid') {
    case 'solid':
      for (let index = 0; index < lamps; ++index) place(surface, index, color)
      break
    case 'gradient':
      for (let index = 0; index < lamps; ++index) {
        const position = lamps <= 1 ? 0 : index / (lamps - 1)
        place(surface, index, rampColor(effect.stops, position) ?? color)
      }
      break
    case 'steps': {
      const steps = effect.steps ?? []
      if (steps.length === 0) break
      for (let index = 0; index < lamps; ++index) {
        const step = steps[Math.min(Math.floor((index * steps.length) / lamps), steps.length - 1)]
        if (!step || fraction + 1e-6 < (step.threshold ?? 0)) continue
        place(surface, index, step.color ?? color)
      }
      break
    }
    case 'gauge': {
      const filled = rampColor(effect.stops, value ?? 0) ?? color
      const lit = Math.round(fraction * lamps)
      for (let index = 0; index < lit && index < lamps; ++index) place(surface, index, filled)
      break
    }
    case 'animation':
      paintAnimation(surface, effect, color, phase, Math.floor(input.elapsedMs / period))
      break
    case 'sprite': {
      const sprite = spriteOf(device, effect.sprite)
      if (sprite) paintStripSprite(surface, sprite, effect, value, colors.tint, input.elapsedMs)
      break
    }
    default:
      break
  }
}

function paintMatrix(
  frame: RgbColor[],
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  input: PaintInput,
  colors: LayerColors,
  valueText: string | undefined,
  value: number | undefined
): void {
  const panel = panelOf(device, frame, effect)
  if (!panel) return
  if ((effect.type ?? 'solid') === 'sprite') {
    paintSprite(panel, device, effect, value, colors.tint, input.elapsedMs)
    return
  }
  const shown = valueText ?? (value === undefined ? '' : wholeText(value))
  paintText(panel, effect, (effect.text ?? '') + shown, colors.ink, input.elapsedMs)
}

function lit(frame: RgbColor[], brightness: number): RgbColor[] {
  if (brightness >= FULL_BRIGHTNESS) return frame
  return frame.map((color) => (color === OFF ? color : scaled(color, brightness)))
}

export function paintOutput(
  device: HardwareDeviceConfiguration,
  input: PaintInput
): RgbColor[] {
  const lamps = lampsOf(device)
  const frame: RgbColor[] = new Array(lamps).fill(OFF)
  for (const [index, effect] of (device.effects ?? []).entries()) {
    if (input.gates[index] === false) continue
    const state = input.states?.[index] ?? newRuleState()
    const colors = colorsOf(effect, input.watched?.[index], state, input.elapsedMs)
    if (colors.background) fillLayer(frame, device, effect, colors.background)
    const started = input.startedMs?.[index] ?? 0
    const blinkMs = colors.blinkMs ?? effect.blink_ms
    if (blinkMs) {
      const since = colors.blinkMs ? (colors.sinceMs ?? 0) : started
      const half = blinkMs / 2
      if (Math.floor((input.elapsedMs - since) / half) % 2 === 1) continue
    }
    const own = started === 0 ? input : { ...input, elapsedMs: input.elapsedMs - started }
    const value = valueOf(effect, input.values?.[index], input.value)
    const type = effect.type ?? 'solid'
    if (isMatrix(device) && (type === 'sprite' || type === 'text')) {
      paintMatrix(frame, device, effect, own, colors, input.valueText?.[index], value)
      continue
    }
    for (const surface of surfacesOf(device, effect, frame)) {
      paintSurface(surface, device, effect, own, colors, value)
    }
  }
  return lit(frame, device.brightness ?? DEFAULT_BRIGHTNESS)
}
