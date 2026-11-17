import { nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { deflateRaw } from 'node:zlib'

import { crc32 } from '../device/asset-crc'
import {
  IMAGE_ID_PATTERN,
  IMAGE_PACKAGE_DATA_OFFSET,
  IMAGE_PACKAGE_FORMAT_VERSION,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  MAXIMUM_SPRITE_FRAMES,
  alignImageOffset,
  imageAssetBytes,
  type ImageColorFormat
} from '../../shared/image-assets'
import { planesFromBitmap } from './image-pixels'
import { t } from '@shared/ui-text'

const HEADER_SIZE = 32
const MANIFEST_ENTRY_SIZE = 64

export const COMPRESSION_NONE = 0
export const COMPRESSION_DEFLATE = 1

const FORMAT_CODES: Record<ImageColorFormat, number> = {
  rgb565: 1,
  rgb565a8: 2,
  alpha8: 4
}

const deflateRawAsync = promisify(deflateRaw)

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

export interface PackageImage {
  name: string
  format: ImageColorFormat
  width: number
  height: number
  stride: number
  frameCount: number
  compression: number
  data: Buffer
  sha256: string
}

export function imageStride(width: number, format: ImageColorFormat): number {
  return format === 'alpha8' ? width : width * 2
}

export function planesDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
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
    stride: imageStride(source.width, source.format),
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
  if (width !== source.width || height !== source.height) {
    throw new Error(t('images.imagePackage.nameCouldNotBeResized', { name: source.name, width: source.width, height: source.height }))
  }
  const bgra = resized.toBitmap()
  if (bgra.byteLength < width * height * 4) {
    throw new Error(t('images.imagePackage.nameDecodedToAnUnexpected', { name: source.name }))
  }
  return planesFromBitmap(bgra, width, height, source.format)
}

export async function packageImage(image: ConvertedImage): Promise<PackageImage> {
  const deflated = await deflateRawAsync(image.bytes, { level: 9 })
  const compressed = deflated.byteLength < image.bytes.byteLength
  return {
    name: image.name,
    format: image.format,
    width: image.width,
    height: image.height,
    stride: image.stride,
    frameCount: image.frameCount,
    compression: compressed ? COMPRESSION_DEFLATE : COMPRESSION_NONE,
    data: compressed ? deflated : image.bytes,
    sha256: planesDigest(image.bytes)
  }
}

export function buildImagePackage(images: readonly PackageImage[]): Buffer {
  validateImages(images)
  const ordered = [...images].sort((left, right) => (left.name < right.name ? -1 : 1))
  const manifest = Buffer.alloc(ordered.length * MANIFEST_ENTRY_SIZE)
  const chunks: { offset: number; bytes: Buffer }[] = []
  let offset = IMAGE_PACKAGE_DATA_OFFSET
  for (const [index, image] of ordered.entries()) {
    const entry = manifest.subarray(index * MANIFEST_ENTRY_SIZE, (index + 1) * MANIFEST_ENTRY_SIZE)
    entry.write(image.name, 0, 'ascii')
    entry.writeUInt16LE(image.width, 32)
    entry.writeUInt16LE(image.height, 34)
    entry.writeUInt8(FORMAT_CODES[image.format], 36)
    entry.writeUInt8(image.compression, 37)
    entry.writeUInt16LE(image.stride, 38)
    entry.writeUInt32LE(offset, 40)
    entry.writeUInt32LE(image.data.byteLength, 44)
    entry.writeUInt32LE(crc32(image.data), 48)
    entry.writeUInt32LE(0, 52)
    entry.writeUInt16LE(0, 56)
    entry.writeUInt16LE(image.frameCount, 58)
    entry.writeUInt32LE(0, 60)
    chunks.push({ offset, bytes: image.data })
    offset = alignImageOffset(offset + image.data.byteLength)
  }

  const packageSize = Math.max(offset, IMAGE_PACKAGE_DATA_OFFSET)
  if (packageSize > MAXIMUM_IMAGE_PACKAGE_SIZE) {
    throw new Error(
      t('images.imagePackage.theImagePackageIsPackagesize', { packageSize: packageSize, mAXIMUM_IMAGE_PACKAGE_SIZE: MAXIMUM_IMAGE_PACKAGE_SIZE })
    )
  }
  const buffer = Buffer.alloc(packageSize)
  manifest.copy(buffer, HEADER_SIZE)
  for (const chunk of chunks) chunk.bytes.copy(buffer, chunk.offset)

  buffer.writeUInt32LE(0x41494353, 0)
  buffer.writeUInt16LE(IMAGE_PACKAGE_FORMAT_VERSION, 4)
  buffer.writeUInt16LE(HEADER_SIZE, 6)
  buffer.writeUInt32LE(0, 8)
  buffer.writeUInt16LE(ordered.length, 12)
  buffer.writeUInt16LE(0, 14)
  buffer.writeUInt32LE(packageSize, 16)
  buffer.writeUInt32LE(crc32(buffer.subarray(HEADER_SIZE, HEADER_SIZE + manifest.byteLength)), 20)
  buffer.writeUInt32LE(crc32(buffer.subarray(IMAGE_PACKAGE_DATA_OFFSET, packageSize)), 24)
  buffer.writeUInt32LE(crc32(buffer.subarray(0, 28)), 28)
  return buffer
}

function validateImages(images: readonly PackageImage[]): void {
  if (images.length === 0) {
    throw new Error(t('images.imagePackage.anImagePackageNeedsAt'))
  }
  if (images.length > MAXIMUM_IMAGES) {
    throw new Error(t('images.imageAssetService.theDeviceStoresAtMost', { mAXIMUM_IMAGES: MAXIMUM_IMAGES }))
  }
  if (HEADER_SIZE + images.length * MANIFEST_ENTRY_SIZE > IMAGE_PACKAGE_DATA_OFFSET) {
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
    const stored = image.data.byteLength
    const fits =
      image.compression === COMPRESSION_NONE
        ? stored === expected
        : image.compression === COMPRESSION_DEFLATE && stored > 0 && stored < expected
    if (!fits) {
      throw new Error(
        t('images.imagePackage.nameIsBytelengthBytesIts', { name: image.name, byteLength: stored, expected: expected })
      )
    }
  }
}
