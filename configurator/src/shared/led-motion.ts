import type { LedEffect, RgbColor } from './configuration-schema'
import { place, surfaceSize, type Surface } from './led-surface'

const STROBE_DUTY = 0.125
const SPARKLE_STRIDE = 131

function shade(color: RgbColor, map: (channel: number) => number): RgbColor {
  const hex = (value: number): string =>
    Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')
  const channel = (at: number): number => Number.parseInt(color.slice(at, at + 2), 16)
  return `#${hex(map(channel(1)))}${hex(map(channel(3)))}${hex(map(channel(5)))}` as RgbColor
}

export function dim(color: RgbColor, level: number): RgbColor {
  const clamped = Math.max(0, Math.min(1, level))
  return shade(color, (channel) => Math.trunc(channel * clamped))
}

export function scaled(color: RgbColor, brightness: number): RgbColor {
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

function scatter(value: number): number {
  let x = value >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

function paintClassic(surface: Surface, effect: LedEffect, color: RgbColor, phase: number): void {
  const lamps = surfaceSize(surface)
  const head = phase * lamps
  const sweep = 1 - Math.abs(2 * phase - 1)
  const breath = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)
  for (let index = 0; index < lamps; ++index) {
    switch (effect.animation ?? 'rainbow') {
      case 'rainbow':
        place(surface, index, wheel(phase + index / lamps))
        break
      case 'pulse':
        place(surface, index, dim(color, breath))
        break
      case 'wipe':
        if (index < head) place(surface, index, color)
        break
      case 'chase':
        if (Math.floor(head) % lamps === index) place(surface, index, color)
        break
      case 'scan':
        place(surface, index, dim(color, 1 - Math.abs(index - sweep * (lamps - 1))))
        break
      default:
        break
    }
  }
}

export function paintAnimation(
  surface: Surface,
  effect: LedEffect,
  color: RgbColor,
  phase: number,
  pass: number
): void {
  const lamps = surfaceSize(surface)
  if (lamps === 0) return
  const span = Math.max(effect.span ?? 3, 1)
  switch (effect.animation ?? 'rainbow') {
    case 'comet': {
      const head = Math.floor(phase * lamps) % lamps
      for (let back = 0; back <= span && back < lamps; ++back) {
        place(surface, (head + lamps - back) % lamps, dim(color, 1 - back / (span + 1)))
      }
      break
    }
    case 'theater':
      for (let index = Math.floor(phase * span) % span; index < lamps; index += span) {
        place(surface, index, color)
      }
      break
    case 'sparkle':
      for (let spark = 0; spark < span; ++spark) {
        const seed = (Math.imul(pass >>> 0, SPARKLE_STRIDE) + spark) >>> 0
        place(surface, scatter(seed) % lamps, dim(color, 1 - phase))
      }
      break
    case 'strobe':
      if (phase < STROBE_DUTY) {
        for (let index = 0; index < lamps; ++index) place(surface, index, color)
      }
      break
    case 'bounce': {
      const block = Math.min(span, lamps)
      const sweep = 1 - Math.abs(2 * phase - 1)
      const start = Math.round(sweep * (lamps - block))
      for (let index = start; index < start + block; ++index) place(surface, index, color)
      break
    }
    default:
      paintClassic(surface, effect, color, phase)
  }
}
