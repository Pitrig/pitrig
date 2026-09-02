import {
  IMAGE_ID_CAPACITY,
  MAXIMUM_LED_SPRITES,
  type HardwareDeviceConfiguration,
  type LedSpriteConfiguration,
  type RgbColor
} from '@shared/configuration-schema'
import {
  USABLE_PALETTE,
  digitOf,
  emptySprite,
  insertFrame,
  maxFramesFor,
  moveFrame,
  pixelsOf,
  remapPixels,
  removeFrame,
  resizePixels,
  spriteGeometry,
  uniqueSpriteId,
  withFrame,
  withPixel
} from '@shared/led-sprite'
import { useDeviceStore } from '@/features/device/device-store'
import { mutateDevice } from './modules-document'

export const NEW_SPRITE_PALETTE: readonly RgbColor[] = [
  '#000000',
  '#ffffff',
  '#ff1744',
  '#ffd600',
  '#00c853',
  '#2979ff'
]

function fits(id: string): boolean {
  return new TextEncoder().encode(id).byteLength < IMAGE_ID_CAPACITY
}

export function spritesOf(
  device: HardwareDeviceConfiguration
): readonly LedSpriteConfiguration[] {
  return device.sprites ?? []
}

export function spriteNameFor(device: HardwareDeviceConfiguration, wanted: string): string {
  const id = uniqueSpriteId(
    spritesOf(device).map((sprite) => sprite.id),
    wanted
  )
  return fits(id) ? id : id.slice(0, 24)
}

export function canAddSprite(device: HardwareDeviceConfiguration): boolean {
  return spritesOf(device).length < MAXIMUM_LED_SPRITES
}

function mutateSprite(
  output: number,
  at: number,
  mutation: (sprite: LedSpriteConfiguration) => void
): void {
  mutateDevice(output, (device) => {
    const sprites = [...(device.sprites ?? [])]
    const sprite = sprites[at]
    if (!sprite) return
    const next = structuredClone(sprite)
    mutation(next)
    sprites[at] = next
    device.sprites = sprites
    clampFrameReferences(device, next.id)
  })
}

function clampFrameReferences(device: HardwareDeviceConfiguration, id: string): void {
  const sprite = (device.sprites ?? []).find((entry) => entry.id === id)
  const frames = sprite ? spriteGeometry(sprite).frames : 1
  device.effects = (device.effects ?? []).map((effect) => {
    if (effect.sprite !== id || (effect.sprite_frame ?? 0) < frames) return effect
    return { ...effect, sprite_frame: Math.max(0, frames - 1) }
  })
}

export function addSprite(
  output: number,
  device: HardwareDeviceConfiguration,
  sprite: LedSpriteConfiguration
): number {
  const at = spritesOf(device).length
  if (at >= MAXIMUM_LED_SPRITES) return -1
  mutateDevice(output, (entry) => {
    entry.sprites = [...(entry.sprites ?? []), sprite]
  })
  return at
}

export function addBlankSprite(
  output: number,
  device: HardwareDeviceConfiguration,
  width: number,
  height: number
): number {
  return addSprite(
    output,
    device,
    emptySprite(spriteNameFor(device, 'picture'), width, height, NEW_SPRITE_PALETTE)
  )
}

export function duplicateSprite(
  output: number,
  device: HardwareDeviceConfiguration,
  at: number
): number {
  const source = spritesOf(device)[at]
  if (!source) return -1
  return addSprite(output, device, {
    ...structuredClone(source),
    id: spriteNameFor(device, `${source.id} copy`)
  })
}

export function removeSprite(output: number, at: number): void {
  mutateDevice(output, (device) => {
    const sprites = [...(device.sprites ?? [])]
    sprites.splice(at, 1)
    if (sprites.length === 0) delete device.sprites
    else device.sprites = sprites
  })
}

export function renameSprite(
  output: number,
  device: HardwareDeviceConfiguration,
  at: number,
  name: string
): boolean {
  const trimmed = name.trim()
  const current = spritesOf(device)[at]?.id
  if (!current || trimmed.length === 0 || trimmed === current || !fits(trimmed)) return false
  if (spritesOf(device).some((sprite) => sprite.id === trimmed)) return false
  mutateDevice(output, (entry) => {
    const sprites = [...(entry.sprites ?? [])]
    const sprite = sprites[at]
    if (!sprite) return
    sprites[at] = { ...sprite, id: trimmed }
    entry.sprites = sprites
    entry.effects = (entry.effects ?? []).map((effect) =>
      effect.sprite === current ? { ...effect, sprite: trimmed } : effect
    )
  })
  return true
}

export function resizeSprite(
  output: number,
  at: number,
  width: number,
  height: number
): void {
  mutateSprite(output, at, (sprite) => {
    const frames = Math.min(spriteGeometry(sprite).frames, maxFramesFor(width, height))
    sprite.pixels = resizePixels(sprite, width, height, frames)
    sprite.width = width
    sprite.height = height
    sprite.frame_count = frames
  })
}

export function paintPixel(
  output: number,
  at: number,
  frame: number,
  pixel: number,
  ink: number
): void {
  mutateSprite(output, at, (sprite) => {
    sprite.pixels = withPixel(sprite, frame, pixel, ink)
  })
}

export function fillFrame(output: number, at: number, frame: number, ink: number): void {
  mutateSprite(output, at, (sprite) => {
    const area = (sprite.width ?? 8) * (sprite.height ?? 8)
    sprite.pixels = withFrame(sprite, frame, digitOf(ink).repeat(area))
  })
}

export function addFrame(output: number, at: number, after: number, copy: boolean): void {
  mutateSprite(output, at, (sprite) => {
    const { width, height, frames } = spriteGeometry(sprite)
    if (frames >= maxFramesFor(width, height)) return
    sprite.pixels = insertFrame(sprite, after, copy)
    sprite.frame_count = frames + 1
  })
}

export function dropFrame(output: number, at: number, frame: number): void {
  mutateSprite(output, at, (sprite) => {
    const { frames } = spriteGeometry(sprite)
    if (frames <= 1) return
    sprite.pixels = removeFrame(sprite, frame)
    sprite.frame_count = frames - 1
  })
}

export function reorderFrame(output: number, at: number, from: number, to: number): void {
  mutateSprite(output, at, (sprite) => {
    sprite.pixels = moveFrame(sprite, from, to)
  })
}

export function setInkColor(
  output: number,
  at: number,
  ink: number,
  color: RgbColor
): void {
  mutateSprite(output, at, (sprite) => {
    const palette = [...(sprite.palette ?? [])]
    if (!palette[ink]) return
    palette[ink] = { color }
    sprite.palette = palette
  })
}

export function addInk(output: number, at: number, color: RgbColor): void {
  mutateSprite(output, at, (sprite) => {
    const palette = [...(sprite.palette ?? [])]
    if (palette.length >= USABLE_PALETTE) return
    sprite.palette = [...palette, { color }]
  })
}

export function removeInk(output: number, at: number, ink: number): void {
  mutateSprite(output, at, (sprite) => {
    const palette = [...(sprite.palette ?? [])]
    if (palette.length <= 1 || !palette[ink]) return
    palette.splice(ink, 1)
    sprite.palette = palette
    sprite.pixels = remapPixels(
      pixelsOf(sprite),
      Array.from({ length: 16 }, (_, entry) => {
        if (entry === ink) return palette.length
        return entry > ink ? entry - 1 : entry
      })
    )
  })
}

export function beginStroke(): void {
  useDeviceStore.getState().beginEdit()
}

export function endStroke(): void {
  useDeviceStore.getState().endEdit()
}
