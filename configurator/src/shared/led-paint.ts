import { rampColor } from './color-ramp'
import { rangeFraction } from './telemetry-value'
import { colorsOf, newRuleState, type LayerColors, type LedRuleState } from './led-colors'
import {
  OFF,
  areaOf,
  deviceShape,
  isMatrix,
  lampsOf,
  matrixLamp,
  maskHolds,
  type LampArea,
  type MatrixShape
} from './led-render'
import { paintSprite, paintText, panelOf } from './led-matrix-paint'
import type { HardwareDeviceConfiguration, LedEffect, RgbColor } from './configuration-schema'

const DEFAULT_BRIGHTNESS = 128
const FULL_BRIGHTNESS = 255

export interface PaintInput {
  value: number
  elapsedMs: number
  gates: readonly boolean[]
  valueText?: readonly (string | undefined)[]
  watched?: readonly (number | undefined)[]
  values?: readonly (number | undefined)[]
  states?: readonly LedRuleState[]
}

function fillArea(
  frame: RgbColor[],
  device: HardwareDeviceConfiguration,
  area: LampArea,
  color: RgbColor
): void {
  const shape = deviceShape(device)
  for (let row = 0; row < area.height; ++row) {
    for (let column = 0; column < area.width; ++column) {
      if (!maskHolds(area, column, row)) continue
      const lamp = matrixLamp(shape, area.x + column, area.y + row)
      if (lamp >= 0 && lamp < frame.length) frame[lamp] = color
    }
  }
}

function rawValueOf(effect: LedEffect, sweep: number): number {
  const minimum = effect.minimum ?? 0
  const maximum = effect.maximum ?? 1
  return minimum + sweep * (maximum - minimum)
}

function valueOf(
  effect: LedEffect,
  live: number | undefined,
  sweep: number
): number | undefined {
  if ((effect.source?.binding ?? '') === '') return undefined
  return live ?? rawValueOf(effect, sweep)
}

function wholeText(value: number): string {
  return String(Math.trunc(value < 0 ? value - 0.5 : value + 0.5))
}

interface Surface {
  shape: MatrixShape
  area: LampArea
  count: number
  inverted: boolean
  mirrored: boolean
}

function surfaceOf(
  device: HardwareDeviceConfiguration,
  effect: LedEffect
): Surface | undefined {
  const area = areaOf(device, effect)
  if (!area) return undefined
  return {
    shape: deviceShape(device),
    area,
    count: area.width * area.height,
    inverted: effect.inverted ?? false,
    mirrored: effect.mirrored ?? false
  }
}

function surfaceSize(surface: Surface): number {
  return surface.mirrored ? Math.ceil(surface.count / 2) : surface.count
}

function place(frame: RgbColor[], surface: Surface, index: number, color: RgbColor): void {
  const put = (offset: number): void => {
    const column = offset % surface.area.width
    const row = Math.floor(offset / surface.area.width)
    if (!maskHolds(surface.area, column, row)) return
    const lamp = matrixLamp(surface.shape, surface.area.x + column, surface.area.y + row)
    if (lamp >= 0 && lamp < frame.length) frame[lamp] = color
  }
  if (!surface.mirrored) {
    put(surface.inverted ? surface.count - 1 - index : index)
    return
  }
  const half = surfaceSize(surface)
  put(surface.inverted ? index : half - 1 - index)
  put(surface.inverted ? surface.count - 1 - index : surface.count - half + index)
}

function shade(color: RgbColor, map: (channel: number) => number): RgbColor {
  const hex = (value: number): string =>
    Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')
  const channel = (at: number): number => Number.parseInt(color.slice(at, at + 2), 16)
  return `#${hex(map(channel(1)))}${hex(map(channel(3)))}${hex(map(channel(5)))}` as RgbColor
}

function dim(color: RgbColor, level: number): RgbColor {
  const clamped = Math.max(0, Math.min(1, level))
  return shade(color, (channel) => Math.trunc(channel * clamped))
}

function scaled(color: RgbColor, brightness: number): RgbColor {
  return shade(color, (channel) => Math.trunc((channel * brightness + 127) / 255))
}

function wheel(turn: number): RgbColor {
  const hue = (turn - Math.floor(turn)) * 6
  const sector = Math.floor(hue)
  const rise = Math.trunc((hue - sector) * 255)
  const fall = 255 - rise
  const hex = (r: number, g: number, b: number): RgbColor =>
    `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}` as RgbColor
  switch (sector) {
    case 0: return hex(255, rise, 0)
    case 1: return hex(fall, 255, 0)
    case 2: return hex(0, 255, rise)
    case 3: return hex(0, fall, 255)
    case 4: return hex(rise, 0, 255)
    default: return hex(255, 0, fall)
  }
}

function paintEffect(
  frame: RgbColor[],
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  input: PaintInput,
  colors: LayerColors,
  value: number | undefined
): void {
  const surface = surfaceOf(device, effect)
  if (!surface) return
  const lamps = surfaceSize(surface)
  const color = colors.ink
  const fraction = value === undefined ? 0 : rangeFraction(value, effect.minimum, effect.maximum)
  const period = (effect.speed_ms ?? 1000) || 1000
  const phase = (input.elapsedMs % period) / period

  switch (effect.type ?? 'solid') {
    case 'solid':
      for (let index = 0; index < lamps; ++index) place(frame, surface, index, color)
      break
    case 'gradient':
      for (let index = 0; index < lamps; ++index) {
        const position = lamps <= 1 ? 0 : index / (lamps - 1)
        place(frame, surface, index, rampColor(effect.stops, position) ?? color)
      }
      break
    case 'steps': {
      const steps = effect.steps ?? []
      if (steps.length === 0) break
      for (let index = 0; index < lamps; ++index) {
        const step = steps[Math.min(Math.floor((index * steps.length) / lamps), steps.length - 1)]
        if (!step || fraction + 1e-6 < (step.threshold ?? 0)) continue
        place(frame, surface, index, step.color ?? color)
      }
      break
    }
    case 'gauge': {
      const filled = rampColor(effect.stops, value ?? 0) ?? color
      const lit = Math.round(fraction * lamps)
      for (let index = 0; index < lit && index < lamps; ++index) {
        place(frame, surface, index, filled)
      }
      break
    }
    case 'animation': {
      const head = phase * lamps
      const sweep = 1 - Math.abs(2 * phase - 1)
      const breath = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)
      for (let index = 0; index < lamps; ++index) {
        switch (effect.animation ?? 'rainbow') {
          case 'rainbow':
            place(frame, surface, index, wheel(phase + index / lamps))
            break
          case 'pulse':
            place(frame, surface, index, dim(color, breath))
            break
          case 'wipe':
            if (index < head) place(frame, surface, index, color)
            break
          case 'chase':
            if (Math.floor(head) % lamps === index) place(frame, surface, index, color)
            break
          case 'scan':
            place(frame, surface, index, dim(color, 1 - Math.abs(index - sweep * (lamps - 1))))
            break
        }
      }
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
  if (!isMatrix(device)) return
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
    const blinkMs = colors.blinkMs ?? effect.blink_ms
    if (blinkMs) {
      const since = colors.blinkMs ? (colors.sinceMs ?? 0) : 0
      const half = blinkMs / 2
      if (Math.floor((input.elapsedMs - since) / half) % 2 === 1) continue
    }
    const area = colors.background ? areaOf(device, effect) : undefined
    if (area && colors.background) fillArea(frame, device, area, colors.background)
    const value = valueOf(effect, input.values?.[index], input.value)
    const type = effect.type ?? 'solid'
    if (type === 'sprite' || type === 'text') {
      paintMatrix(frame, device, effect, input, colors, input.valueText?.[index], value)
      continue
    }
    paintEffect(frame, device, effect, input, colors, value)
  }
  return lit(frame, device.brightness ?? DEFAULT_BRIGHTNESS)
}
