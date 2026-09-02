import { glyphRow, textWidth, LED_FACES, type LedFontName } from './led-font'
import { areaOf, maskHolds, matrixLamp, shapeOf, type LampArea } from './led-render'
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
  const frames = sprite.frame_count ?? 1
  const palette = sprite.palette ?? []
  const pixels = sprite.pixels ?? ''
  const area = width * height
  let index = effect.sprite_frame ?? 0
  if (value !== undefined) {
    const rounded = Math.round(value)
    index = rounded <= 0 ? 0 : Math.min(rounded, frames - 1)
  } else if (effect.sprite_loop && frames > 1) {
    index = Math.floor(elapsedMs / ((effect.speed_ms ?? 1000) || 1000)) % frames
  }
  index = Math.min(index, frames - 1)
  const base = index * area
  if (base + area > pixels.length) return
  const originX = Math.trunc((panel.area.width - width) / 2)
  const originY = Math.trunc((panel.area.height - height) / 2)
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const digit = Number.parseInt(pixels[base + y * width + x] ?? '', 16)
      const entry = palette[digit]
      if (!Number.isInteger(digit) || !entry?.color) continue
      const painted = tint && Number.parseInt(entry.color.slice(1), 16) !== 0 ? tint : entry.color
      put(panel, originX + x, originY + y, painted)
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
