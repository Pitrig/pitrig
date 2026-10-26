import { glyphRow, textWidth, LED_FACES, type LedFontName } from './led-font'
import { areaOf, maskHolds, matrixLamp, shapeOf, type LampArea } from './led-render'
import { place, surfaceSize, type Surface } from './led-surface'
import { rangeFraction } from './telemetry-value'
import type {
  HardwareDeviceConfiguration,
  LedEffect,
  LedSpriteConfiguration,
  RgbColor
} from './configuration-schema'

export interface Panel {
  device: HardwareDeviceConfiguration
  frame: RgbColor[]
  area: LampArea
}

export function panelOf(
  device: HardwareDeviceConfiguration,
  frame: RgbColor[],
  effect: LedEffect
): Panel | undefined {
  const area = areaOf(device, effect)
  return area ? { device, frame, area } : undefined
}

function put(panel: Panel, x: number, y: number, color: RgbColor): void {
  const shape = shapeOf(panel.device)
  if (!shape) return
  if (x < 0 || y < 0 || x >= panel.area.width || y >= panel.area.height) return
  if (!maskHolds(panel.area, x, y)) return
  const lamp = matrixLamp(shape, panel.area.x + x, panel.area.y + y)
  if (lamp >= 0 && lamp < panel.frame.length) panel.frame[lamp] = color
}

export function spriteOf(
  device: HardwareDeviceConfiguration,
  id: string | undefined
): LedSpriteConfiguration | undefined {
  return (device.sprites ?? []).find((sprite) => sprite.id === id)
}

export function spriteFrameIndex(
  sprite: LedSpriteConfiguration,
  effect: LedEffect,
  value: number | undefined,
  elapsedMs: number
): number {
  const frames = sprite.frame_count ?? 1
  const last = frames - 1
  if (value !== undefined && effect.sprite_scaled) {
    return Math.min(Math.trunc(rangeFraction(value, effect.minimum, effect.maximum) * frames), last)
  }
  if (value !== undefined) {
    const rounded = Math.round(value)
    return rounded <= 0 ? 0 : Math.min(rounded, last)
  }
  if (effect.sprite_loop && frames > 1) {
    return Math.floor(elapsedMs / ((effect.speed_ms ?? 1000) || 1000)) % frames
  }
  return Math.min(effect.sprite_frame ?? 0, last)
}

function inkOf(
  sprite: LedSpriteConfiguration,
  digit: string | undefined,
  tint: RgbColor | undefined
): RgbColor | undefined {
  const index = Number.parseInt(digit ?? '', 16)
  const entry = (sprite.palette ?? [])[index]
  if (!Number.isInteger(index) || !entry?.color) return undefined
  return tint && Number.parseInt(entry.color.slice(1), 16) !== 0 ? tint : entry.color
}

export function paintStripSprite(
  surface: Surface,
  sprite: LedSpriteConfiguration,
  effect: LedEffect,
  value: number | undefined,
  tint: RgbColor | undefined,
  elapsedMs: number
): void {
  const width = sprite.width ?? 8
  const pixels = sprite.pixels ?? ''
  const base = spriteFrameIndex(sprite, effect, value, elapsedMs) * width
  if (base + width > pixels.length) return
  const shown = Math.min(width, surfaceSize(surface))
  for (let lamp = 0; lamp < shown; ++lamp) {
    const ink = inkOf(sprite, pixels[base + lamp], tint)
    if (ink) place(surface, lamp, ink)
  }
}

export function paintSprite(
  panel: Panel,
  device: HardwareDeviceConfiguration,
  effect: LedEffect,
  value: number | undefined,
  tint: RgbColor | undefined,
  elapsedMs: number
): void {
  const sprite = spriteOf(device, effect.sprite)
  if (!sprite) return
  const width = sprite.width ?? 8
  const height = sprite.height ?? 8
  const pixels = sprite.pixels ?? ''
  const area = width * height
  const base = spriteFrameIndex(sprite, effect, value, elapsedMs) * area
  if (base + area > pixels.length) return
  const originX = Math.trunc((panel.area.width - width) / 2)
  const originY = Math.trunc((panel.area.height - height) / 2)
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const ink = inkOf(sprite, pixels[base + y * width + x], tint)
      if (ink) put(panel, originX + x, originY + y, ink)
    }
  }
}

export function paintText(
  panel: Panel,
  effect: LedEffect,
  text: string,
  color: RgbColor,
  elapsedMs: number
): void {
  if (text.length === 0) return
  const font: LedFontName =
    effect.font === 'bold_4x6' || effect.font === 'regular_6x8' || effect.font === 'bold_6x8'
      ? effect.font
      : 'regular_4x6'
  const face = LED_FACES[font]
  const advance = face.width + 1
  const width = textWidth(font, text.length)
  const drawn = { width: panel.area.width, height: panel.area.height }
  const top = Math.trunc((drawn.height - face.height) / 2)

  let left = Math.trunc((drawn.width - width) / 2)
  if (width > drawn.width) {
    const step = (effect.speed_ms ?? 1000) || 1000
    const span = width + drawn.width
    left = drawn.width - (Math.floor(elapsedMs / step) % span)
  }

  for (let index = 0; index < text.length; ++index) {
    const glyphLeft = left + index * advance
    if (glyphLeft >= drawn.width || glyphLeft + face.width <= 0) continue
    for (let row = 0; row < face.height; ++row) {
      const bits = glyphRow(font, text[index] ?? ' ', row)
      for (let column = 0; column < face.width; ++column) {
        if ((bits & (1 << (face.width - 1 - column))) !== 0) {
          put(panel, glyphLeft + column, top + row, color)
        }
      }
    }
  }
}
