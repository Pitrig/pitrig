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
import { t } from '@shared/ui-text'

const HEADER_SIZE = 32
const MANIFEST_ENTRY_SIZE = 64
const ASSET_DATA_OFFSET = IMAGE_PACKAGE_DATA_OFFSET
const FORMAT_VERSION = IMAGE_PACKAGE_FORMAT_VERSION

const COMPRESSION_NONE = 0
const COMPRESSION_DEFLATE = 1
const IMAGE_ALIGNMENT = IMAGE_PACKAGE_ALIGNMENT

const FORMAT_CODES: Record<ImageColorFormat, number> = {
  rgb565: 1,
  rgb565a8: 2,
  alpha8: 4
}

function storedBytes(raw: Buffer): { bytes: Buffer; compression: number } {
  const deflated = deflateRawSync(raw, { level: 9 })
  return deflated.byteLength < raw.byteLength
    ? { bytes: deflated, compression: COMPRESSION_DEFLATE }
    : { bytes: raw, compression: COMPRESSION_NONE }
}

export interface ImageSource {
  name: string
  paths: string[]
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
  frameCount: number
  bytes: Buffer
}

export function convertImage(source: ImageSource): ConvertedImage {
  if (source.paths.length === 0) {
    throw new Error(t('images.imagePackage.nameHasNoImageFile', { name: source.name }))
  }
  if (source.paths.length > MAXIMUM_SPRITE_FRAMES) {
    throw new Error(
      t('images.imagePackage.nameHasLengthFramesAn', { name: source.name, length: source.paths.length, mAXIMUM_SPRITE_FRAMES: MAXIMUM_SPRITE_FRAMES })
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
    throw new Error(t('images.imagePackage.pathIsNotAReadable', { path: path }))
  }
  const resized =
    decoded.getSize().width === source.width && decoded.getSize().height === source.height
      ? decoded
      : decoded.resize({ width: source.width, height: source.height, quality: 'best' })
  const { width, height } = resized.getSize()
  const bgra = resized.toBitmap()
  if (bgra.byteLength < width * height * 4) {
    throw new Error(t('images.imagePackage.nameDecodedToAnUnexpected', { name: source.name }))
  }

  const pixels = width * height
  const colorBytes = source.format === 'alpha8' ? 0 : pixels * 2
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
    bytes.writeUInt16LE(
      ((red & 0xf8) << 8) | ((green & 0xfc) << 3) | (blue >> 3),
      index * 2
    )
    if (source.format === 'rgb565a8') {
      bytes.writeUInt8(alpha, colorBytes + index)
    }
  }
  if (width !== source.width || height !== source.height) {
    throw new Error(t('images.imagePackage.nameCouldNotBeResized', { name: source.name, width: source.width, height: source.height }))
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
      t('images.imagePackage.theImagePackageIsPackagesize', { packageSize: packageSize, mAXIMUM_IMAGE_PACKAGE_SIZE: MAXIMUM_IMAGE_PACKAGE_SIZE })
    )
  }
  const buffer = Buffer.alloc(packageSize)
  manifest.copy(buffer, HEADER_SIZE)
  for (const chunk of chunks) chunk.bytes.copy(buffer, chunk.offset)

  buffer.writeUInt32LE(0x41494353, 0)
  buffer.writeUInt16LE(FORMAT_VERSION, 4)
  buffer.writeUInt16LE(HEADER_SIZE, 6)
  buffer.writeUInt32LE(0, 8)
  buffer.writeUInt16LE(images.length, 12)
  buffer.writeUInt16LE(0, 14)
  buffer.writeUInt32LE(packageSize, 16)
  buffer.writeUInt32LE(crc32(buffer.subarray(HEADER_SIZE, HEADER_SIZE + manifest.byteLength)), 20)
  buffer.writeUInt32LE(crc32(buffer.subarray(ASSET_DATA_OFFSET, packageSize)), 24)
  buffer.writeUInt32LE(crc32(buffer.subarray(0, 28)), 28)
  return buffer
}

function validateImages(images: readonly ConvertedImage[]): void {
  if (images.length === 0) {
    throw new Error(t('images.imagePackage.anImagePackageNeedsAt'))
  }
  if (images.length > MAXIMUM_IMAGES) {
    throw new Error(t('images.imageAssetService.theDeviceStoresAtMost', { mAXIMUM_IMAGES: MAXIMUM_IMAGES }))
  }
  if (HEADER_SIZE + images.length * MANIFEST_ENTRY_SIZE > ASSET_DATA_OFFSET) {
    throw new Error(t('images.imagePackage.theImageManifestDoesNot'))
  }
  const names = new Set<string>()
  for (const image of images) {
    if (!IMAGE_ID_PATTERN.test(image.name)) {
      throw new Error(
        t('images.imagePackage.nameIsNotAValid', { name: image.name })
      )
    }
    if (names.has(image.name)) {
      throw new Error(t('images.imageAssetService.imageNameIsListedTwice', { name: image.name }))
    }
    names.add(image.name)
    if (
      image.width < 1 ||
      image.height < 1 ||
      image.width > MAXIMUM_IMAGE_DIMENSION ||
      image.height > MAXIMUM_IMAGE_DIMENSION
    ) {
      throw new Error(
        t('images.imagePackage.nameIsWidthHeightThe', { name: image.name, width: image.width, height: image.height, mAXIMUM_IMAGE_DIMENSION: MAXIMUM_IMAGE_DIMENSION })
      )
    }
    if (image.frameCount < 1 || image.frameCount > MAXIMUM_SPRITE_FRAMES) {
      throw new Error(
        t('images.imagePackage.nameHasFramecountFramesThe', { name: image.name, frameCount: image.frameCount, mAXIMUM_SPRITE_FRAMES: MAXIMUM_SPRITE_FRAMES })
      )
    }
    const expected = imageAssetBytes(image.width, image.height, image.format) * image.frameCount
    if (image.bytes.byteLength !== expected) {
      throw new Error(
        t('images.imagePackage.nameIsBytelengthBytesIts', { name: image.name, byteLength: image.bytes.byteLength, expected: expected })
      )
    }
  }
}

function align(value: number): number {
  return (value + IMAGE_ALIGNMENT - 1) & ~(IMAGE_ALIGNMENT - 1)
}
