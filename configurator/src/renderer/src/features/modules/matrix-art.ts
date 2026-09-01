import {
  LED_SPRITE_PIXEL_CAPACITY,
  MAXIMUM_LED_SPRITE_FRAMES,
  type LedPaletteEntry,
  type LedSpriteConfiguration,
  type RgbColor
} from '@shared/configuration-schema'

const SHADES = 10
const DARK: RgbColor = '#000000'

function mix(left: RgbColor, right: RgbColor, amount: number): RgbColor {
  const channel = (at: number): string => {
    const from = Number.parseInt(left.slice(at, at + 2), 16)
    const to = Number.parseInt(right.slice(at, at + 2), 16)
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}` as RgbColor
}

function shades(color: RgbColor): LedPaletteEntry[] {
  return Array.from({ length: SHADES }, (_, index) => ({
    color: mix(DARK, color, index / (SHADES - 1))
  }))
}

function framesFor(width: number, height: number): number {
  const usable = LED_SPRITE_PIXEL_CAPACITY - 1
  const area = Math.max(1, width * height)
  return Math.max(1, Math.min(MAXIMUM_LED_SPRITE_FRAMES, Math.floor(usable / area)))
}

function digit(level: number): string {
  const clamped = Math.min(Math.max(level, 0), 1)
  return Math.round(clamped * (SHADES - 1)).toString(16)
}

function paint(
  width: number,
  height: number,
  frames: number,
  level: (x: number, y: number, phase: number) => number
): string {
  let pixels = ''
  for (let frame = 0; frame < frames; ++frame) {
    const phase = frame / frames
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        pixels += digit(level(x, y, phase))
      }
    }
  }
  return pixels
}

export function diagonalSprite(
  id: string,
  width: number,
  height: number,
  color: RgbColor
): LedSpriteConfiguration {
  const frames = framesFor(width, height)
  const span = Math.max(1, width + height - 1)
  return {
    id,
    width,
    height,
    frame_count: frames,
    palette: shades(color),
    pixels: paint(width, height, frames, (x, y, phase) =>
      0.5 + 0.5 * Math.cos(2 * Math.PI * ((x + y) / span - phase))
    )
  }
}

export function discSprite(
  id: string,
  width: number,
  height: number,
  color: RgbColor
): LedSpriteConfiguration {
  const centreX = (width - 1) / 2
  const centreY = (height - 1) / 2
  const radius = Math.min(width, height) / 2 - 0.5
  return {
    id,
    width,
    height,
    frame_count: 1,
    palette: shades(color),
    pixels: paint(width, height, 1, (x, y) => {
      const distance = Math.hypot(x - centreX, y - centreY)
      return radius - distance + 0.5
    })
  }
}

export function chequerSprite(
  id: string,
  width: number,
  height: number
): LedSpriteConfiguration {
  const frames = framesFor(width, height)
  const square = Math.max(1, Math.round(Math.min(width, height) / 4))
  const span = Math.max(1, width + height - 1)
  return {
    id,
    width,
    height,
    frame_count: frames,
    palette: shades('#FFFFFF'),
    pixels: paint(width, height, frames, (x, y, phase) => {
      const shift = Math.round(phase * square * 2)
      const lit =
        (Math.floor((x + shift) / square) + Math.floor(y / square)) % 2 === 0
      if (!lit) return 0
      return 0.6 + 0.4 * Math.cos(2 * Math.PI * ((x + y) / span - phase))
    })
  }
}
