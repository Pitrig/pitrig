import { nativeImage } from 'electron'

import { crc32 } from '../device/asset-crc'
import {
  IMAGE_ID_PATTERN,
  IMAGE_PACKAGE_ALIGNMENT,
  IMAGE_PACKAGE_DATA_OFFSET,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
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

const HEADER_SIZE = 32
const MANIFEST_ENTRY_SIZE = 64
const ASSET_DATA_OFFSET = IMAGE_PACKAGE_DATA_OFFSET
const FORMAT_VERSION = 1
// Matches the device's alignment: the cache line, and the draw buffer alignment
// the P4 wants.
const IMAGE_ALIGNMENT = IMAGE_PACKAGE_ALIGNMENT

const FORMAT_CODES: Record<ImageColorFormat, number> = {
  rgb565: 1,
  rgb565a8: 2,
  indexed8: 3,
  alpha8: 4
}

export interface ImageSource {
  name: string
  path: string
  format: ImageColorFormat
  width: number
  height: number
}

export interface ConvertedImage {
  name: string
  format: ImageColorFormat
  width: number
  height: number
  stride: number
  bytes: Buffer
}

/**
 * Decodes, resizes and converts one image to the layout the device draws.
 * Resizing happens here because the device neither scales nor rotates: a scaled
 * image would drop off the ESP32-P4's accelerated path, so the pixels are made
 * the right size before they ever reach the board.
 */
export function convertImage(source: ImageSource): ConvertedImage {
  if (source.format === 'indexed8') {
    // The device format reserves it, but producing a good palette needs
    // quantisation this does not do, and a bad one looks worse than RGB565.
    throw new Error('Indexed colour is not produced by the configurator yet.')
  }
  const decoded = nativeImage.createFromPath(source.path)
  if (decoded.isEmpty()) {
    throw new Error(`"${source.path}" is not a readable image.`)
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
  return {
    name: source.name,
    format: source.format,
    width,
    height,
    stride: source.format === 'alpha8' ? width : width * 2,
    bytes
  }
}

export function buildImagePackage(images: readonly ConvertedImage[]): Buffer {
  validateImages(images)
  const manifest = Buffer.alloc(images.length * MANIFEST_ENTRY_SIZE)
  const chunks: { offset: number; bytes: Buffer }[] = []
  let offset = ASSET_DATA_OFFSET
  images.forEach((image, index) => {
    const entry = manifest.subarray(index * MANIFEST_ENTRY_SIZE, (index + 1) * MANIFEST_ENTRY_SIZE)
    entry.write(image.name, 0, 'ascii')
    entry.writeUInt16LE(image.width, 32)
    entry.writeUInt16LE(image.height, 34)
    entry.writeUInt8(FORMAT_CODES[image.format], 36)
    entry.writeUInt8(0, 37)
    entry.writeUInt16LE(image.stride, 38)
    entry.writeUInt32LE(offset, 40)
    entry.writeUInt32LE(image.bytes.byteLength, 44)
    entry.writeUInt32LE(crc32(image.bytes), 48)
    // Palette offset and count are for indexed images only.
    entry.writeUInt32LE(0, 52)
    entry.writeUInt16LE(0, 56)
    entry.writeUInt16LE(0, 58)
    entry.writeUInt32LE(0, 60)
    chunks.push({ offset, bytes: image.bytes })
    offset = align(offset + image.bytes.byteLength)
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
  }
}

function align(value: number): number {
  return (value + IMAGE_ALIGNMENT - 1) & ~(IMAGE_ALIGNMENT - 1)
}
