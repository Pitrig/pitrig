export const IMAGE_SELECT_SOURCE_CHANNEL = 'image-assets:select-source' as const
export const IMAGE_UPLOAD_CHANNEL = 'image-assets:upload' as const
export const IMAGE_CANCEL_UPLOAD_CHANNEL = 'image-assets:cancel-upload' as const
export const IMAGE_CLEAR_CHANNEL = 'image-assets:clear' as const
export const IMAGE_UPLOAD_PROGRESS_CHANNEL = 'image-assets:upload-progress' as const

export const MAXIMUM_IMAGES = 32
export const MAXIMUM_IMAGE_PACKAGE_SIZE = 4 * 1024 * 1024
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

export interface ImageAssetState {
  storageAvailable: boolean
  packageAvailable: boolean
  rebootRequired: boolean
  formatVersion: number
  packageSize: number
  images: InstalledImage[]
}
