import type { AssetResult, AssetUploadProgress } from './asset-upload'

export const FIRMWARE_SELECT_SOURCE_CHANNEL = 'firmware-update:select-source' as const
export const FIRMWARE_UPLOAD_CHANNEL = 'firmware-update:upload' as const
export const FIRMWARE_CANCEL_UPLOAD_CHANNEL = 'firmware-update:cancel-upload' as const
export const FIRMWARE_UPLOAD_PROGRESS_CHANNEL = 'firmware-update:upload-progress' as const

// Firmware travels the same road as fonts and images: the `SCF1` frames, the
// staged progress and the failure vocabulary are shared. What is its own is the
// package around the application image, and what the device reports about the
// two slots it boots from.

// "SCFW", little endian, matching the device's kMagic.
export const FIRMWARE_PACKAGE_MAGIC = 0x5746_4353
export const FIRMWARE_FORMAT_VERSION = 1
export const FIRMWARE_HEADER_SIZE = 32
export const FIRMWARE_MANIFEST_ENTRY_SIZE = 2
// Where the application image starts inside the package.
export const FIRMWARE_IMAGE_OFFSET = 64
// One OTA slot, 2.5 MiB. An image larger than this cannot be installed on any
// board.
export const MAXIMUM_FIRMWARE_IMAGE_SIZE = 2560 * 1024

export interface FirmwareUpdateState {
  /** False when the running partition table has no second slot. */
  storageAvailable: boolean
  /** Partition the device is running from, e.g. `ota_0`. */
  running: string
  /** Partition the next upload lands in. */
  target: string
  /** Version string of the running image. */
  version: string
  /** The running image has not been marked valid yet; a reset would roll back. */
  pendingVerify: boolean
  /** An image is staged and selected. It runs after the next restart. */
  rebootRequired: boolean
}

export interface FirmwareSourceSelection {
  id: string
  name: string
  /** Image size in bytes, before the package header is added. */
  size: number
}

export type FirmwareUploadProgress = AssetUploadProgress
export type FirmwareUpdateResult<T> = AssetResult<T>

export interface FirmwareUploadRequest {
  sourceId: string
}
