export const IMAGE_SELECT_SOURCE_CHANNEL = 'image-assets:select-source' as const
export const IMAGE_UPLOAD_CHANNEL = 'image-assets:upload' as const
export const IMAGE_CANCEL_UPLOAD_CHANNEL = 'image-assets:cancel-upload' as const
export const IMAGE_CLEAR_CHANNEL = 'image-assets:clear' as const
export const IMAGE_UPLOAD_PROGRESS_CHANNEL = 'image-assets:upload-progress' as const

export const MAXIMUM_IMAGES = 32
export const MAXIMUM_IMAGE_PACKAGE_SIZE = 4 * 1024 * 1024
/** Where the `SCIA` package's pixels start, after its header and manifest. */
export const IMAGE_PACKAGE_DATA_OFFSET = 4096
/** The device's alignment: the cache line, and the P4's draw-buffer alignment. */
export const IMAGE_PACKAGE_ALIGNMENT = 64
export const MAXIMUM_IMAGE_DIMENSION = 2048
export const IMAGE_ID_PATTERN = /^[a-z0-9_-]{1,31}$/

// The pixel layouts the device draws. Conversion happens here rather than on the
// board: a decoder would cost flash, a decode buffer in external RAM and time
// inside a frame, and the configurator already knows the size each image is
// drawn at.
export type ImageColorFormat = 'rgb565' | 'rgb565a8' | 'indexed8' | 'alpha8'

export const IMAGE_COLOR_FORMATS: readonly ImageColorFormat[] = [
  'rgb565',
  'rgb565a8',
  'indexed8',
  'alpha8'
]

export interface ImageSourceSelection {
  id: string
  name: string
  width: number
  height: number
  /**
   * A small rendering of the file, so a staged row can show what it is before
   * anything has been converted. The source rather than the result: the
   * conversion depends on the size and format the author is still choosing, and
   * re-converting on every keystroke would be a round trip per character. What
   * the board will actually hold is what the installed list shows.
   */
  dataUrl?: string
}

export interface ImageAssetInput {
  sourceId: string
  /** Identifier a widget refers to. */
  name: string
  format: ImageColorFormat
  /** Size to convert to; the device draws the image as uploaded. */
  width: number
  height: number
}

export interface ImageUploadRequest {
  assets: ImageAssetInput[]
}

/** One installed image, as the device reports it. */
export interface InstalledImage {
  name: string
  width: number
  height: number
  format: string
}

/**
 * What one image costs the package, exactly as the converter lays it out: a
 * colour plane of two bytes per pixel unless the image is a mask, and an alpha
 * plane of one byte per pixel unless it is opaque.
 *
 * Shared because two sides need the same answer — the converter allocates by
 * it, and the panel says how much of the four megabytes a selection will take
 * before anything is sent.
 */
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

/** What a set of images would occupy once packed, headers and padding included. */
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
