import { rampColor } from './color-ramp'
import { rangeFraction } from './telemetry-value'
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
import { paintSprite, paintText, panelOf, spriteOf } from './led-matrix-paint'
import type {
  HardwareDeviceConfiguration,
  LedEffect,
  RgbColor
} from './configuration-schema'

export interface PaintInput {
  value: number
  elapsedMs: number
  gates: readonly boolean[]
}

function rawValueOf(effect: LedEffect, sweep: number): number {
  const minimum = effect.minimum ?? 0
  const maximum = effect.maximum ?? 1
  return minimum + sweep * (maximum - minimum)
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

function dim(color: RgbColor, level: number): RgbColor {
  const clamped = Math.max(0, Math.min(1, level))
  const channel = (at: number): number =>
    Math.trunc(Number.parseInt(color.slice(at, at + 2), 16) * clamped)
  const hex = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${hex(channel(1))}${hex(channel(3))}${hex(channel(5))}` as RgbColor
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
  input: PaintInput
): void {
  const surface = surfaceOf(device, effect)
  if (!surface) return
  const lamps = surfaceSize(surface)
  const color = effect.color ?? '#ffffff'
  const value = rawValueOf(effect, input.value)
  const fraction = rangeFraction(value, effect.minimum, effect.maximum)
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
      const filled = rampColor(effect.stops, value) ?? color
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
  input: PaintInput
): void {
  if (!isMatrix(device)) return
  const panel = panelOf(device, frame, effect)
  if (!panel) return
  if ((effect.type ?? 'solid') === 'sprite') {
    const frames = spriteOf(device, effect.sprite)?.frame_count ?? 1
    const value = (effect.source?.binding ?? '') === '' ? undefined : input.value * (frames - 1)
    paintSprite(panel, device, effect, value, input.elapsedMs)
    return
  }
  const bound = (effect.source?.binding ?? '') !== ''
  const text = (effect.text ?? '') + (bound ? String(Math.round(input.value)) : '')
  paintText(panel, effect, text, input.elapsedMs)
}

export function paintOutput(
  device: HardwareDeviceConfiguration,
  input: PaintInput
): RgbColor[] {
  const lamps = lampsOf(device)
  const frame: RgbColor[] = new Array(lamps).fill(OFF)
  for (const [index, effect] of (device.effects ?? []).entries()) {
    if (input.gates[index] === false) continue
    if (effect.blink_ms) {
      const half = effect.blink_ms / 2
      if (Math.floor(input.elapsedMs / half) % 2 === 1) continue
    }
    const type = effect.type ?? 'solid'
    if (type === 'sprite' || type === 'text') {
      paintMatrix(frame, device, effect, input)
      continue
    }
    paintEffect(frame, device, effect, input)
  }
  return frame
}
