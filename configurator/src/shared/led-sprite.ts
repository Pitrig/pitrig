import {
  LED_PALETTE_SIZE,
  LED_SPRITE_PIXEL_CAPACITY,
  MAXIMUM_LED_SPRITE_FRAMES,
  MAXIMUM_MATRIX_SIDE,
  type LedPaletteEntry,
  type LedSpriteConfiguration,
  type RgbColor
} from './configuration-schema'

export const TRANSPARENT_DIGIT = 'f'
export const TRANSPARENT_INK = LED_PALETTE_SIZE - 1
export const USABLE_PALETTE = LED_PALETTE_SIZE - 1
export const SPRITE_DIGIT_BUDGET = LED_SPRITE_PIXEL_CAPACITY - 1

export interface SpriteGeometry {
  width: number
  height: number
  frames: number
}

export function spriteGeometry(sprite: LedSpriteConfiguration): SpriteGeometry {
  return {
    width: sprite.width ?? 8,
    height: sprite.height ?? 8,
    frames: sprite.frame_count ?? 1
  }
}

export function spriteArea(sprite: LedSpriteConfiguration): number {
  const { width, height } = spriteGeometry(sprite)
  return Math.max(1, width * height)
}

export function spriteDigits(sprite: LedSpriteConfiguration): number {
  const { frames } = spriteGeometry(sprite)
  return spriteArea(sprite) * frames
}

export function maxFramesFor(width: number, height: number): number {
  const area = Math.max(1, width * height)
  return Math.max(1, Math.min(MAXIMUM_LED_SPRITE_FRAMES, Math.floor(SPRITE_DIGIT_BUDGET / area)))
}

export function paletteOf(sprite: LedSpriteConfiguration): readonly LedPaletteEntry[] {
  return sprite.palette ?? []
}

export function inkColor(
  sprite: LedSpriteConfiguration,
  ink: number
): RgbColor | undefined {
  return paletteOf(sprite)[ink]?.color
}

export function transparentInk(sprite: LedSpriteConfiguration): number | undefined {
  return paletteOf(sprite).length <= USABLE_PALETTE ? TRANSPARENT_INK : undefined
}

export function digitOf(ink: number): string {
  return Math.max(0, Math.min(LED_PALETTE_SIZE - 1, ink)).toString(16)
}

export function inkAt(pixels: string, at: number): number {
  const ink = Number.parseInt(pixels[at] ?? '', 16)
  return Number.isInteger(ink) ? ink : TRANSPARENT_INK
}

export function pixelsOf(sprite: LedSpriteConfiguration): string {
  const expected = spriteDigits(sprite)
  const pixels = sprite.pixels ?? ''
  if (pixels.length === expected) return pixels
  return pixels.slice(0, expected).padEnd(expected, TRANSPARENT_DIGIT)
}

export function frameOf(sprite: LedSpriteConfiguration, frame: number): string {
  const area = spriteArea(sprite)
  return pixelsOf(sprite).slice(frame * area, (frame + 1) * area)
}

export function blankFrame(area: number): string {
  return TRANSPARENT_DIGIT.repeat(area)
}

export function withPixel(
  sprite: LedSpriteConfiguration,
  frame: number,
  at: number,
  ink: number
): string {
  const area = spriteArea(sprite)
  const pixels = pixelsOf(sprite)
  const offset = frame * area + at
  if (offset < 0 || offset >= pixels.length) return pixels
  return pixels.slice(0, offset) + digitOf(ink) + pixels.slice(offset + 1)
}

export function withFrame(
  sprite: LedSpriteConfiguration,
  frame: number,
  digits: string
): string {
  const area = spriteArea(sprite)
  const pixels = pixelsOf(sprite)
  if (digits.length !== area) return pixels
  return pixels.slice(0, frame * area) + digits + pixels.slice((frame + 1) * area)
}

function framesOf(sprite: LedSpriteConfiguration): string[] {
  const { frames } = spriteGeometry(sprite)
  return Array.from({ length: frames }, (_, frame) => frameOf(sprite, frame))
}

export function insertFrame(
  sprite: LedSpriteConfiguration,
  after: number,
  copy: boolean
): string {
  const frames = framesOf(sprite)
  const blank = blankFrame(spriteArea(sprite))
  frames.splice(after + 1, 0, copy ? (frames[after] ?? blank) : blank)
  return frames.join('')
}

export function removeFrame(sprite: LedSpriteConfiguration, frame: number): string {
  const frames = framesOf(sprite)
  if (frames.length <= 1) return frames.join('')
  frames.splice(frame, 1)
  return frames.join('')
}

export function moveFrame(
  sprite: LedSpriteConfiguration,
  from: number,
  to: number
): string {
  const frames = framesOf(sprite)
  const moved = frames[from]
  if (moved === undefined || to < 0 || to >= frames.length) return frames.join('')
  frames.splice(from, 1)
  frames.splice(to, 0, moved)
  return frames.join('')
}

export function resizePixels(
  sprite: LedSpriteConfiguration,
  width: number,
  height: number,
  frames: number
): string {
  const before = spriteGeometry(sprite)
  const source = pixelsOf(sprite)
  const area = Math.max(1, before.width * before.height)
  let pixels = ''
  for (let frame = 0; frame < frames; ++frame) {
    const base = frame * area
    for (let row = 0; row < height; ++row) {
      for (let column = 0; column < width; ++column) {
        const inside =
          frame < before.frames && row < before.height && column < before.width
        pixels += inside
          ? digitOf(inkAt(source, base + row * before.width + column))
          : TRANSPARENT_DIGIT
      }
    }
  }
  return pixels
}

export function remapPixels(pixels: string, mapping: readonly number[]): string {
  let remapped = ''
  for (const digit of pixels) {
    const ink = Number.parseInt(digit, 16)
    remapped += Number.isInteger(ink) ? digitOf(mapping[ink] ?? TRANSPARENT_INK) : TRANSPARENT_DIGIT
  }
  return remapped
}

export function clampSide(side: number): number {
  return Math.max(1, Math.min(MAXIMUM_MATRIX_SIDE, Math.round(side)))
}

export function emptySprite(
  id: string,
  width: number,
  height: number,
  palette: readonly RgbColor[]
): LedSpriteConfiguration {
  const side = { width: clampSide(width), height: clampSide(height) }
  return {
    id,
    ...side,
    frame_count: 1,
    palette: palette.slice(0, USABLE_PALETTE).map((color) => ({ color })),
    pixels: blankFrame(side.width * side.height)
  }
}

export function uniqueSpriteId(
  taken: readonly string[],
  wanted: string
): string {
  if (!taken.includes(wanted)) return wanted
  for (let suffix = 2; suffix < 100; ++suffix) {
    const candidate = `${wanted} ${suffix}`
    if (!taken.includes(candidate)) return candidate
  }
  return `${wanted} ${Date.now()}`
}
