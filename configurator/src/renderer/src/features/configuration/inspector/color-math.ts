import type { RgbColor } from '@shared/configuration-schema'

export interface Channels {
  r: number
  g: number
  b: number
}

export interface Hsv {
  h: number
  s: number
  v: number
}

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

export function parseHex(value: string): Channels | undefined {
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return undefined
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16)
  }
}

export function toHex({ r, g, b }: Channels): RgbColor {
  const pair = (level: number): string => clamp(Math.round(level), 0, 255).toString(16).padStart(2, '0')
  return `#${pair(r)}${pair(g)}${pair(b)}`.toUpperCase() as RgbColor
}

export function rgbToHsv({ r, g, b }: Channels): Hsv {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const high = Math.max(red, green, blue)
  const low = Math.min(red, green, blue)
  const span = high - low
  let h = 0
  if (span !== 0) {
    if (high === red) h = ((green - blue) / span) % 6
    else if (high === green) h = (blue - red) / span + 2
    else h = (red - green) / span + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: high === 0 ? 0 : span / high, v: high }
}

export function hsvToRgb(h: number, s: number, v: number): Channels {
  const chroma = v * s
  const second = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const base = v - chroma
  const sector = Math.floor(h / 60) % 6
  const [red, green, blue] =
    sector === 0
      ? [chroma, second, 0]
      : sector === 1
        ? [second, chroma, 0]
        : sector === 2
          ? [0, chroma, second]
          : sector === 3
            ? [0, second, chroma]
            : sector === 4
              ? [second, 0, chroma]
              : [chroma, 0, second]
  return { r: (red + base) * 255, g: (green + base) * 255, b: (blue + base) * 255 }
}
