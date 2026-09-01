import type {
  HardwareDeviceConfiguration,
  LedSpriteConfiguration,
  RgbColor
} from '@shared/configuration-schema'
import { mutateDevice } from './modules-document'

export const DEFAULT_PALETTE: readonly RgbColor[] = [
  '#000000',
  '#ff0000',
  '#ffbf00',
  '#00c853',
  '#38bdf8',
  '#ffffff'
]

export function blankPixels(sprite: LedSpriteConfiguration): string {
  const area = (sprite.width ?? 8) * (sprite.height ?? 8) * (sprite.frame_count ?? 1)
  return '0'.repeat(area)
}

export function resizePixels(sprite: LedSpriteConfiguration, next: LedSpriteConfiguration): string {
  const from = { w: sprite.width ?? 8, h: sprite.height ?? 8, f: sprite.frame_count ?? 1 }
  const to = { w: next.width ?? 8, h: next.height ?? 8, f: next.frame_count ?? 1 }
  const pixels = sprite.pixels ?? ''
  let out = ''
  for (let frame = 0; frame < to.f; ++frame) {
    for (let y = 0; y < to.h; ++y) {
      for (let x = 0; x < to.w; ++x) {
        const inside = frame < from.f && y < from.h && x < from.w
        out += inside ? (pixels[frame * from.w * from.h + y * from.w + x] ?? '0') : '0'
      }
    }
  }
  return out
}

export function mutateSprites(
  output: number,
  mutation: (sprites: LedSpriteConfiguration[]) => void
): void {
  mutateDevice(output, (device) => {
    const sprites = [...(device.sprites ?? [])]
    mutation(sprites)
    if (sprites.length === 0) delete device.sprites
    else device.sprites = sprites
  })
}

export function mutateSprite(
  output: number,
  index: number,
  mutation: (sprite: LedSpriteConfiguration) => void
): void {
  mutateSprites(output, (sprites) => {
    const sprite = sprites[index]
    if (!sprite) return
    const next = structuredClone(sprite)
    mutation(next)
    sprites[index] = next
  })
}

export function setPixel(
  output: number,
  index: number,
  frame: number,
  x: number,
  y: number,
  value: number
): void {
  mutateSprite(output, index, (sprite) => {
    const width = sprite.width ?? 8
    const height = sprite.height ?? 8
    const at = frame * width * height + y * width + x
    const pixels = (sprite.pixels ?? blankPixels(sprite)).split('')
    if (at >= pixels.length) return
    pixels[at] = value.toString(16)
    sprite.pixels = pixels.join('')
  })
}

export function nextSpriteId(device: HardwareDeviceConfiguration): string {
  const taken = new Set((device.sprites ?? []).map((sprite) => sprite.id))
  for (let index = 1; index < 100; ++index) {
    const id = `sprite${index}`
    if (!taken.has(id)) return id
  }
  return 'sprite'
}
