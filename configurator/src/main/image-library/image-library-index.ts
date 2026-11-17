import {
  IMAGE_COLOR_FORMATS,
  IMAGE_ID_PATTERN,
  MAXIMUM_IMAGES,
  MAXIMUM_IMAGE_DIMENSION,
  MAXIMUM_IMAGE_PACKAGE_SIZE,
  MAXIMUM_SPRITE_FRAMES,
  imageAssetBytes,
  storedImagePackageSize,
  type ImageColorFormat
} from '../../shared/image-assets'
import {
  IMAGE_LIBRARY_FORMAT,
  IMAGE_LIBRARY_FORMAT_VERSION,
  MAXIMUM_INSTALLED_RECORDS,
  type ImageLibraryEntry,
  type InstalledImageRecord,
  type InstalledPackageRecord
} from '../../shared/image-library'
import type { PackageImage } from '../image-assets/image-package'
import { t } from '@shared/ui-text'

export interface StoredImage extends ImageLibraryEntry {
  compression: number
  blobCrc: number
}

export interface LibraryState {
  installed: InstalledPackageRecord[]
  legacySeeded: boolean
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/

export function emptyState(): LibraryState {
  return { installed: [], legacySeeded: false }
}

export function parseLibraryState(value: unknown): LibraryState {
  if (!isRecord(value) || value.format !== IMAGE_LIBRARY_FORMAT) return emptyState()
  return {
    installed: (Array.isArray(value.installed) ? value.installed : [])
      .filter(isInstalledPackage)
      .slice(0, MAXIMUM_INSTALLED_RECORDS),
    legacySeeded: value.legacySeeded === true
  }
}

export function serializeLibraryState(state: LibraryState): string {
  return `${JSON.stringify(
    {
      format: IMAGE_LIBRARY_FORMAT,
      format_version: IMAGE_LIBRARY_FORMAT_VERSION,
      legacySeeded: state.legacySeeded,
      installed: state.installed
    },
    null,
    2
  )}\n`
}

export function parseStoredImage(value: unknown, id: string): StoredImage | undefined {
  if (!isRecord(value) || value.id !== id || !IMAGE_ID_PATTERN.test(id)) return undefined
  if (!hasGeometry(value)) return undefined
  const raw =
    imageAssetBytes(value.width as number, value.height as number, value.format as ImageColorFormat) *
    (value.frameCount as number)
  const stored = value.storedBytes
  const compression = value.compression
  const storedFits =
    isCount(stored, MAXIMUM_IMAGE_PACKAGE_SIZE) &&
    (compression === 0 ? stored === raw : compression === 1 && (stored as number) < raw)
  if (
    !storedFits ||
    !Number.isSafeInteger(value.blobCrc) ||
    (value.blobCrc as number) < 0 ||
    (value.blobCrc as number) > 0xffff_ffff ||
    typeof value.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.sha256) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return undefined
  }
  return {
    id,
    width: value.width as number,
    height: value.height as number,
    frameCount: value.frameCount as number,
    format: value.format as ImageColorFormat,
    storedBytes: stored as number,
    compression: compression as number,
    blobCrc: value.blobCrc as number,
    sha256: value.sha256,
    updatedAt: value.updatedAt
  }
}

export function serializeStoredImage(image: StoredImage): string {
  return `${JSON.stringify(image, null, 2)}\n`
}

export function publicEntry(entry: StoredImage): ImageLibraryEntry {
  return {
    id: entry.id,
    width: entry.width,
    height: entry.height,
    frameCount: entry.frameCount,
    format: entry.format,
    storedBytes: entry.storedBytes,
    sha256: entry.sha256,
    updatedAt: entry.updatedAt
  }
}

function isInstalledPackage(value: unknown): value is InstalledPackageRecord {
  if (!isRecord(value)) return false
  return (
    isCount(value.size, MAXIMUM_IMAGE_PACKAGE_SIZE) &&
    typeof value.installedAt === 'number' &&
    Array.isArray(value.images) &&
    value.images.length <= MAXIMUM_IMAGES &&
    value.images.every(isInstalledImage)
  )
}

function isInstalledImage(value: unknown): value is InstalledImageRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    IMAGE_ID_PATTERN.test(value.id) &&
    hasGeometry(value) &&
    typeof value.sha256 === 'string' &&
    SHA256_PATTERN.test(value.sha256)
  )
}

function hasGeometry(value: Record<string, unknown>): boolean {
  return (
    isCount(value.width, MAXIMUM_IMAGE_DIMENSION) &&
    isCount(value.height, MAXIMUM_IMAGE_DIMENSION) &&
    isCount(value.frameCount, MAXIMUM_SPRITE_FRAMES) &&
    IMAGE_COLOR_FORMATS.includes(value.format as ImageColorFormat)
  )
}

function isCount(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function libraryProblem(image: PackageImage): string | undefined {
  if (!IMAGE_ID_PATTERN.test(image.name)) {
    return t('images.imagePackage.nameIsNotAValid', { name: image.name })
  }
  if (
    !isCount(image.width, MAXIMUM_IMAGE_DIMENSION) ||
    !isCount(image.height, MAXIMUM_IMAGE_DIMENSION) ||
    !isCount(image.frameCount, MAXIMUM_SPRITE_FRAMES)
  ) {
    return t('images.imagePackage.nameIsWidthHeightThe', {
      name: image.name,
      width: image.width,
      height: image.height,
      mAXIMUM_IMAGE_DIMENSION: MAXIMUM_IMAGE_DIMENSION
    })
  }
  const packageSize = storedImagePackageSize([image.data.byteLength])
  if (packageSize > MAXIMUM_IMAGE_PACKAGE_SIZE) {
    return t('images.imageLibrary.tooLarge', {
      id: image.name,
      size: Math.ceil(packageSize / 1024),
      limit: Math.floor(MAXIMUM_IMAGE_PACKAGE_SIZE / 1024)
    })
  }
  return undefined
}
