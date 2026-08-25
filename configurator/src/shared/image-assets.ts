export const IMAGE_SELECT_SOURCE_CHANNEL = 'image-assets:select-source' as const
export const IMAGE_UPLOAD_CHANNEL = 'image-assets:upload' as const
export const IMAGE_CANCEL_UPLOAD_CHANNEL = 'image-assets:cancel-upload' as const
export const IMAGE_CLEAR_CHANNEL = 'image-assets:clear' as const
export const IMAGE_UPLOAD_PROGRESS_CHANNEL = 'image-assets:upload-progress' as const

export const MAXIMUM_IMAGES = 32
export const MAXIMUM_IMAGE_PACKAGE_SIZE = 7 * 1024 * 1024
/** Where the `SCIA` package's pixels start, after its header and manifest. */
export const IMAGE_PACKAGE_DATA_OFFSET = 4096
/** The device's alignment: the cache line, and the P4's draw-buffer alignment. */
export const IMAGE_PACKAGE_ALIGNMENT = 64
export const MAXIMUM_IMAGE_DIMENSION = 2048
export const IMAGE_ID_PATTERN = /^[a-z0-9_-]{1,31}$/
/**
 * Frames one image may hold as a sprite sheet. Must match kMaximumSpriteFrames
 * in the image contract and in the configuration schema.
 */
export const MAXIMUM_SPRITE_FRAMES = 64
/** What this application writes: 2 added compression and the frame count. */
export const IMAGE_PACKAGE_FORMAT_VERSION = 2
/**
 * The oldest a board may report and still be understood. Version 1 packages
 * stay readable — nothing about their bytes changed meaning — so a board that
 * has not been given a new package since is not treated as broken.
 */
export const MINIMUM_IMAGE_PACKAGE_FORMAT_VERSION = 1

// The pixel layouts the device draws. Conversion happens here rather than on the
// board: a decoder would cost flash, a decode buffer in external RAM and time
// inside a frame, and the configurator already knows the size each image is
// drawn at. What the artwork costs in flash is answered by compressing the
// package instead, which the board undoes once at startup — see
// docs/image-assets.md.
//
// `indexed8` is not among them. LVGL cannot blend an indexed image: it expands
// one to ARGB8888 a line at a time on every repaint, and that also puts it
// outside the ESP32-P4 accelerator, so it would buy storage that compression
// gives back for nothing.
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
  /**
   * Whether any pixel is less than fully opaque. A file that carries an alpha
   * channel but never uses one needs no alpha plane on the device, and saying so
   * here is what keeps a third of the image out of both flash and external RAM.
   */
  hasAlpha: boolean
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
  /**
   * The picked files, in the order they become frames. One is an ordinary
   * image; more make a sprite sheet, which a widget switches between from
   * telemetry without spending an entry per picture.
   */
  sourceIds: string[]
  /** Identifier a widget refers to. */
  name: string
  format: ImageColorFormat
  /** Size to convert every frame to; the device draws them as uploaded. */
  width: number
  height: number
}

export interface ImageUploadRequest {
  assets: ImageAssetInput[]
}

/** One installed image, as the device reports it. */
export interface InstalledImage {
  name: string
  /** Of one frame, which for an ordinary image is the whole of it. */
  width: number
  height: number
  format: string
  /** 1 for an ordinary image; more makes it a sprite sheet. */
  frameCount: number
}

/**
 * What one image occupies in memory, exactly as the converter lays it out: a
 * colour plane of two bytes per pixel unless the image is a mask, and an alpha
 * plane of one byte per pixel unless it is opaque.
 *
 * Shared because three sides need the same answer — the converter allocates by
 * it, the panel says how much of the four megabytes a selection will take
 * before anything is sent, and the board reserves external RAM by it. Since
 * the package is compressed, this is what the board holds while drawing and an
 * upper bound on what the package itself costs, never the size on flash. What
 * that came to is what the device reports back.
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

/**
 * What a set of images would occupy once packed uncompressed, headers and
 * padding included — so an upper bound on the package, and exactly the
 * external RAM the board reserves for it. Compression only ever makes the
 * stored side of that smaller.
 */
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
