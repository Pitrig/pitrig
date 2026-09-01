import { glyphRow, textWidth, LED_FACES, type LedFontName } from './led-font'
import { drawnSize, matrixLamp, scaledColor, shapeOf } from './led-render'
import type {
  HardwareDeviceConfiguration,
  LedEffect,
  LedSpriteConfiguration,
  RgbColor
} from './configuration-schema'

export interface Panel {
  device: HardwareDeviceConfiguration
  frame: RgbColor[]
}

function put(panel: Panel, x: number, y: number, color: RgbColor): void {
  const shape = shapeOf(panel.device)
  if (!shape) return
  const lamp = matrixLamp(shape, x, y)
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
  value: number | undefined
): void {
  const shape = shapeOf(panel.device)
  const sprite = spriteOf(device, effect.sprite)
  if (!shape || !sprite) return
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
  }
  index = Math.min(index, frames - 1)
  const base = index * area
  if (base + area > pixels.length) return
  const brightness = effect.brightness ?? 255
  const drawn = drawnSize(shape)
  const originX = Math.trunc((drawn.width - width) / 2)
  const originY = Math.trunc((drawn.height - height) / 2)
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const digit = Number.parseInt(pixels[base + y * width + x] ?? '', 16)
      const entry = palette[digit]
      if (!Number.isInteger(digit) || !entry?.color) continue
      put(panel, originX + x, originY + y, scaledColor(entry.color, brightness))
    }
  }
}

export function paintText(
  panel: Panel,
  effect: LedEffect,
  text: string,
  elapsedMs: number
): void {
  const shape = shapeOf(panel.device)
  if (!shape || text.length === 0) return
  const font: LedFontName = effect.font === 'large' ? 'large' : 'small'
  const face = LED_FACES[font]
  const advance = face.width + 1
  const width = textWidth(font, text.length)
  const drawn = drawnSize(shape)
  const top = Math.trunc((drawn.height - face.height) / 2)
  const color = scaledColor(effect.color ?? '#ffffff', effect.brightness ?? 255)

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
