import { nativeImage } from 'electron'

import { imageAssetBytes, type ImageColorFormat } from '../../shared/image-assets'

export interface ImagePlanes {
  format: ImageColorFormat
  width: number
  height: number
  frameCount: number
  bytes: Buffer
}

export function planesFromBitmap(
  bgra: Buffer,
  width: number,
  height: number,
  format: ImageColorFormat
): Buffer {
  const pixels = width * height
  const colorBytes = format === 'alpha8' ? 0 : pixels * 2
  const straight = format === 'rgb565a8'
  const planes = Buffer.alloc(imageAssetBytes(width, height, format))
  for (let index = 0; index < pixels; ++index) {
    const alpha = bgra[index * 4 + 3] ?? 0xff
    if (format === 'alpha8') {
      planes[index] = alpha
      continue
    }
    const blue = unpremultiplied(bgra[index * 4] ?? 0, alpha, straight)
    const green = unpremultiplied(bgra[index * 4 + 1] ?? 0, alpha, straight)
    const red = unpremultiplied(bgra[index * 4 + 2] ?? 0, alpha, straight)
    planes.writeUInt16LE(((red & 0xf8) << 8) | ((green & 0xfc) << 3) | (blue >> 3), index * 2)
    if (straight) planes[colorBytes + index] = alpha
  }
  return planes
}

export function bitmapFromPlanes(image: ImagePlanes): Buffer {
  const pixels = image.width * image.height
  const frames = Math.max(1, image.frameCount)
  const colorBytes = image.format === 'alpha8' ? 0 : pixels * 2
  const frameBytes = imageAssetBytes(image.width, image.height, image.format)
  const bgra = Buffer.alloc(pixels * frames * 4)
  for (let frame = 0; frame < frames; ++frame) {
    const source = frame * frameBytes
    const target = frame * pixels
    for (let index = 0; index < pixels; ++index) {
      const alpha =
        image.format === 'rgb565' ? 0xff : (image.bytes[source + colorBytes + index] ?? 0)
      let red = 0xff
      let green = 0xff
      let blue = 0xff
      if (image.format !== 'alpha8') {
        const packed = image.bytes.readUInt16LE(source + index * 2)
        red = expand5((packed >> 11) & 0x1f)
        green = expand6((packed >> 5) & 0x3f)
        blue = expand5(packed & 0x1f)
      }
      const out = (target + index) * 4
      bgra[out] = premultiplied(blue, alpha)
      bgra[out + 1] = premultiplied(green, alpha)
      bgra[out + 2] = premultiplied(red, alpha)
      bgra[out + 3] = alpha
    }
  }
  return bgra
}

export function hasTransparency(decoded: Electron.NativeImage): boolean {
  const { width, height } = decoded.getSize()
  const bgra = decoded.toBitmap()
  const pixels = width * height
  if (bgra.byteLength < pixels * 4) return true
  for (let index = 0; index < pixels; ++index) {
    if (bgra[index * 4 + 3] !== 0xff) return true
  }
  return false
}

export function legacyFormat(png: Buffer): ImageColorFormat | undefined {
  const decoded = nativeImage.createFromBuffer(png)
  if (decoded.isEmpty()) return undefined
  return hasTransparency(decoded) ? 'rgb565a8' : 'rgb565'
}

export function encodePlanesAsPng(image: ImagePlanes): Buffer | undefined {
  if (image.width <= 0 || image.height <= 0) return undefined
  const frames = Math.max(1, image.frameCount)
  const expected = imageAssetBytes(image.width, image.height, image.format) * frames
  if (image.bytes.byteLength !== expected) return undefined
  const encoded = nativeImage.createFromBitmap(bitmapFromPlanes(image), {
    width: image.width,
    height: image.height * frames
  })
  return encoded.isEmpty() ? undefined : encoded.toPNG()
}

export function planesFromPng(
  png: Buffer,
  format: ImageColorFormat,
  frameCount: number
): ImagePlanes | undefined {
  const decoded = nativeImage.createFromBuffer(png)
  if (decoded.isEmpty()) return undefined
  const { width, height } = decoded.getSize()
  const frames = Math.max(1, frameCount)
  if (width < 1 || height < frames || height % frames !== 0) return undefined
  const bitmap = decoded.toBitmap()
  if (bitmap.byteLength < width * height * 4) return undefined
  const frameHeight = height / frames
  const frameBitmapBytes = width * frameHeight * 4
  const planes: Buffer[] = []
  for (let frame = 0; frame < frames; ++frame) {
    const slice = bitmap.subarray(frame * frameBitmapBytes, (frame + 1) * frameBitmapBytes)
    planes.push(planesFromBitmap(slice, width, frameHeight, format))
  }
  return {
    format,
    width,
    height: frameHeight,
    frameCount: frames,
    bytes: frames === 1 ? planes[0]! : Buffer.concat(planes)
  }
}

function unpremultiplied(value: number, alpha: number, straight: boolean): number {
  if (!straight || alpha === 0xff) return value
  if (alpha === 0) return 0
  return Math.min(0xff, Math.round((value * 0xff) / alpha))
}

function premultiplied(value: number, alpha: number): number {
  return alpha === 0xff ? value : Math.round((value * alpha) / 0xff)
}

function expand5(value: number): number {
  return (value << 3) | (value >> 2)
}

function expand6(value: number): number {
  return (value << 2) | (value >> 4)
}
