export const IMAGE_SELECT_SOURCE_CHANNEL = 'image-assets:select-source' as const
export const IMAGE_UPLOAD_CHANNEL = 'image-assets:upload' as const
export const IMAGE_CANCEL_UPLOAD_CHANNEL = 'image-assets:cancel-upload' as const
export const IMAGE_CLEAR_CHANNEL = 'image-assets:clear' as const
export const IMAGE_UPLOAD_PROGRESS_CHANNEL = 'image-assets:upload-progress' as const

export const MAXIMUM_IMAGES = 32
export const MAXIMUM_IMAGE_PACKAGE_SIZE = 7 * 1024 * 1024
export const IMAGE_PACKAGE_DATA_OFFSET = 4096
export const IMAGE_PACKAGE_ALIGNMENT = 64
export const MAXIMUM_IMAGE_DIMENSION = 2048
export const IMAGE_ID_PATTERN = /^[a-z0-9_-]{1,31}$/
export const MAXIMUM_SPRITE_FRAMES = 64
export const IMAGE_PACKAGE_FORMAT_VERSION = 2
export const MINIMUM_IMAGE_PACKAGE_FORMAT_VERSION = 1

export type ImageColorFormat = 'rgb565' | 'rgb565a8' | 'alpha8'

export const IMAGE_COLOR_FORMATS: readonly ImageColorFormat[] = [
  'rgb565',
  'rgb565a8',
  'alpha8'
]

export interface ImageSourceSelection {
  id: string
  name: string
  width: number
  height: number
  hasAlpha: boolean
  dataUrl?: string
}

export interface ImageAssetInput {
  sourceIds: string[]
  name: string
  format: ImageColorFormat
  width: number
  height: number
}

export interface ImageUploadRequest {
  assets: ImageAssetInput[]
}

export interface InstalledImage {
  name: string
  width: number
  height: number
  format: string
  frameCount: number
}

export function imageAssetBytes(
  width: number,
  height: number,
  format: ImageColorFormat
): number {
  const pixels = Math.max(0, width) * Math.max(0, height)
  const color = format === 'alpha8' ? 0 : pixels * 2
  const alpha = format === 'rgb565' ? 0 : pixels
  return color + alpha
}

export function imagePackageSize(
  images: readonly { width: number; height: number; format: ImageColorFormat }[]
): number {
  let offset = IMAGE_PACKAGE_DATA_OFFSET
  for (const image of images) {
    const bytes = imageAssetBytes(image.width, image.height, image.format)
    offset = Math.ceil((offset + bytes) / IMAGE_PACKAGE_ALIGNMENT) * IMAGE_PACKAGE_ALIGNMENT
  }
  return Math.max(offset, IMAGE_PACKAGE_DATA_OFFSET)
}

export interface ImageAssetState {
  storageAvailable: boolean
  packageAvailable: boolean
  rebootRequired: boolean
  formatVersion: number
  packageSize: number
  images: InstalledImage[]
}
