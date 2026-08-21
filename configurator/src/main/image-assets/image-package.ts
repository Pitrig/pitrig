import { nativeImage } from 'electron'
import { deflateRawSync } from 'node:zlib'

import { crc32 } from '../device/asset-crc'
import {
  IMAGE_ID_PATTERN,
  IMAGE_PACKAGE_ALIGNMENT,
  IMAGE_PACKAGE_DATA_OFFSET,
  IMAGE_PACKAGE_FORMAT_VERSION,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  MAXIMUM_SPRITE_FRAMES,
  imageAssetBytes,
  type ImageColorFormat
} from '../../shared/image-assets'

// The `SCIA` package: a header, a manifest, and the pixels the device draws
// directly. The header layout is the font package's byte for byte, so the two
// stay readable side by side; the manifest entry is where they differ, because
// a face describes its own geometry and a bitmap does not.
//
// Conversion happens here rather than on the board. A decoder there would cost
// flash, a decode buffer in external RAM and time inside a frame, and the
// configurator already knows the size each image is drawn at.
//
// The pixels are stored deflated, which is the one thing that costs the device
// nothing: it inflates each image once at startup, into the external RAM it was
// going to copy the image into anyway, and what LVGL then draws from is the
// same raw bytes it would have had. So the artwork's size lands on flash, where
// there are four megabytes, rather than on the frame.

const HEADER_SIZE = 32
const MANIFEST_ENTRY_SIZE = 64
const ASSET_DATA_OFFSET = IMAGE_PACKAGE_DATA_OFFSET
// 2 added the per-entry compression byte and the frame count, both in fields
// version 1 reserved.
const FORMAT_VERSION = IMAGE_PACKAGE_FORMAT_VERSION

const COMPRESSION_NONE = 0
const COMPRESSION_DEFLATE = 1
// Matches the device's alignment: the cache line, and the draw buffer alignment
// the P4 wants.
const IMAGE_ALIGNMENT = IMAGE_PACKAGE_ALIGNMENT

// 3 was `indexed8`, which the device reserves rather than accepts.
const FORMAT_CODES: Record<ImageColorFormat, number> = {
  rgb565: 1,
  rgb565a8: 2,
  alpha8: 4
}

/**
 * The bytes to store for one image, and how they are stored. Deflate is skipped
 * when it does not actually pay: artwork that is already noise compresses to
 * more than it started as, and there is no reason to make the board inflate it
 * to learn that.
 */
function storedBytes(raw: Buffer): { bytes: Buffer; compression: number } {
  const deflated = deflateRawSync(raw, { level: 9 })
  return deflated.byteLength < raw.byteLength
    ? { bytes: deflated, compression: COMPRESSION_DEFLATE }
    : { bytes: raw, compression: COMPRESSION_NONE }
}

export interface ImageSource {
  name: string
  /**
   * The files that become its frames, in order. One is an ordinary image; more
   * make a sprite sheet, stored as whole frames back to back — the only layout
   * contiguous in every colour format, which is what lets the device reach a
   * frame by moving a pointer rather than by decoding anything.
   */
  paths: string[]
  format: ImageColorFormat
  width: number
  height: number
}

export interface ConvertedImage {
  name: string
  format: ImageColorFormat
  /** Of one frame. */
  width: number
  height: number
  stride: number
  frameCount: number
  /** Every frame, back to back. */
  bytes: Buffer
}

/**
 * Decodes, resizes and converts every frame of one image to the layout the
 * device draws, and lays them out back to back. Resizing happens here because
 * the device neither scales nor rotates: a scaled image would drop off the
 * ESP32-P4's accelerated path, so the pixels are made the right size before
 * they ever reach the board.
 *
 * Every frame is converted to the same geometry, which is what makes a frame a
 * fixed step through the buffer on the device.
 */
export function convertImage(source: ImageSource): ConvertedImage {
  if (source.paths.length === 0) {
    throw new Error(`"${source.name}" has no image file.`)
  }
  if (source.paths.length > MAXIMUM_SPRITE_FRAMES) {
    throw new Error(
      `"${source.name}" has ${source.paths.length} frames; an image holds at most ${MAXIMUM_SPRITE_FRAMES}.`
    )
  }
  const frames = source.paths.map((path) => convertFrame(source, path))
  return {
    name: source.name,
    format: source.format,
    width: source.width,
    height: source.height,
    stride: source.format === 'alpha8' ? source.width : source.width * 2,
    frameCount: frames.length,
    bytes: frames.length === 1 ? frames[0]! : Buffer.concat(frames)
  }
}

function convertFrame(source: ImageSource, path: string): Buffer {
  const decoded = nativeImage.createFromPath(path)
  if (decoded.isEmpty()) {
    throw new Error(`"${path}" is not a readable image.`)
  }
  const resized =
    decoded.getSize().width === source.width && decoded.getSize().height === source.height
      ? decoded
      : decoded.resize({ width: source.width, height: source.height, quality: 'best' })
  const { width, height } = resized.getSize()
  const bgra = resized.toBitmap()
  if (bgra.byteLength < width * height * 4) {
    throw new Error(`"${source.name}" decoded to an unexpected size.`)
  }

  const pixels = width * height
  const colorBytes = source.format === 'alpha8' ? 0 : pixels * 2
  // The one formula, so the panel's estimate and this allocation cannot drift.
  const bytes = Buffer.alloc(imageAssetBytes(width, height, source.format))
  for (let index = 0; index < pixels; ++index) {
    const blue = bgra[index * 4] ?? 0
    const green = bgra[index * 4 + 1] ?? 0
    const red = bgra[index * 4 + 2] ?? 0
    const alpha = bgra[index * 4 + 3] ?? 255
    if (source.format === 'alpha8') {
      bytes.writeUInt8(alpha, index)
      continue
    }
    // RGB565, little endian, which is what LVGL reads.
    bytes.writeUInt16LE(
      ((red & 0xf8) << 8) | ((green & 0xfc) << 3) | (blue >> 3),
      index * 2
    )
    if (source.format === 'rgb565a8') {
      // The alpha plane follows the whole colour plane, at half its stride.
      bytes.writeUInt8(alpha, colorBytes + index)
    }
  }
  if (width !== source.width || height !== source.height) {
    // Every frame has to land on the same geometry, or the fixed step the
    // device walks the sheet by would drift between them.
    throw new Error(`"${source.name}" could not be resized to ${source.width} × ${source.height}.`)
  }
  return bytes
}

export function buildImagePackage(images: readonly ConvertedImage[]): Buffer {
  validateImages(images)
  const manifest = Buffer.alloc(images.length * MANIFEST_ENTRY_SIZE)
  const chunks: { offset: number; bytes: Buffer }[] = []
  let offset = ASSET_DATA_OFFSET
  images.forEach((image, index) => {
    const entry = manifest.subarray(index * MANIFEST_ENTRY_SIZE, (index + 1) * MANIFEST_ENTRY_SIZE)
    // Length and CRC describe what is stored, so an interrupted or corrupted
    // transfer is caught before anything is inflated; the geometry beside them
    // describes what it becomes.
    const { bytes, compression } = storedBytes(image.bytes)
    entry.write(image.name, 0, 'ascii')
    entry.writeUInt16LE(image.width, 32)
    entry.writeUInt16LE(image.height, 34)
    entry.writeUInt8(FORMAT_CODES[image.format], 36)
    entry.writeUInt8(compression, 37)
    entry.writeUInt16LE(image.stride, 38)
    entry.writeUInt32LE(offset, 40)
    entry.writeUInt32LE(bytes.byteLength, 44)
    entry.writeUInt32LE(crc32(bytes), 48)
    // Palette offset and count belonged to indexed images, which are gone.
    entry.writeUInt32LE(0, 52)
    entry.writeUInt16LE(0, 56)
    entry.writeUInt16LE(image.frameCount, 58)
    entry.writeUInt32LE(0, 60)
    chunks.push({ offset, bytes })
    offset = align(offset + bytes.byteLength)
  })

  const packageSize = Math.max(offset, ASSET_DATA_OFFSET)
  if (packageSize > MAXIMUM_IMAGE_PACKAGE_SIZE) {
    throw new Error(
      `The image package is ${packageSize} bytes; the device stores at most ${MAXIMUM_IMAGE_PACKAGE_SIZE}.`
    )
  }
  const buffer = Buffer.alloc(packageSize)
  manifest.copy(buffer, HEADER_SIZE)
  for (const chunk of chunks) chunk.bytes.copy(buffer, chunk.offset)

  buffer.writeUInt32LE(0x41494353, 0) // "SCIA"
  buffer.writeUInt16LE(FORMAT_VERSION, 4)
  buffer.writeUInt16LE(HEADER_SIZE, 6)
  buffer.writeUInt32LE(0, 8)
  buffer.writeUInt16LE(images.length, 12)
  buffer.writeUInt16LE(0, 14)
  buffer.writeUInt32LE(packageSize, 16)
  buffer.writeUInt32LE(crc32(buffer.subarray(HEADER_SIZE, HEADER_SIZE + manifest.byteLength)), 20)
  buffer.writeUInt32LE(crc32(buffer.subarray(ASSET_DATA_OFFSET, packageSize)), 24)
  // Written last of all, mirroring the device's own commit order.
  buffer.writeUInt32LE(crc32(buffer.subarray(0, 28)), 28)
  return buffer
}

function validateImages(images: readonly ConvertedImage[]): void {
  if (images.length === 0) {
    throw new Error('An image package needs at least one image.')
  }
  if (images.length > MAXIMUM_IMAGES) {
    throw new Error(`The device stores at most ${MAXIMUM_IMAGES} images.`)
  }
  if (HEADER_SIZE + images.length * MANIFEST_ENTRY_SIZE > ASSET_DATA_OFFSET) {
    throw new Error('The image manifest does not fit before the pixel data.')
  }
  const names = new Set<string>()
  for (const image of images) {
    if (!IMAGE_ID_PATTERN.test(image.name)) {
      throw new Error(
        `"${image.name}" is not a valid image name: lower case letters, digits, dash and underscore, up to 31 characters.`
      )
    }
    if (names.has(image.name)) {
      throw new Error(`Image "${image.name}" is listed twice.`)
    }
    names.add(image.name)
    if (
      image.width < 1 ||
      image.height < 1 ||
      image.width > MAXIMUM_IMAGE_DIMENSION ||
      image.height > MAXIMUM_IMAGE_DIMENSION
    ) {
      throw new Error(
        `"${image.name}" is ${image.width}×${image.height}; the device accepts up to ${MAXIMUM_IMAGE_DIMENSION} on each side.`
      )
    }
    if (image.frameCount < 1 || image.frameCount > MAXIMUM_SPRITE_FRAMES) {
      throw new Error(
        `"${image.name}" has ${image.frameCount} frames; the device accepts 1 to ${MAXIMUM_SPRITE_FRAMES}.`
      )
    }
    // The device derives every frame's position from the geometry, so the bytes
    // have to be exactly that many frames of exactly that size.
    const expected = imageAssetBytes(image.width, image.height, image.format) * image.frameCount
    if (image.bytes.byteLength !== expected) {
      throw new Error(
        `"${image.name}" is ${image.bytes.byteLength} bytes; its geometry implies ${expected}.`
      )
    }
  }
}

function align(value: number): number {
  return (value + IMAGE_ALIGNMENT - 1) & ~(IMAGE_ALIGNMENT - 1)
}
