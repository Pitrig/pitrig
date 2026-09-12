import type { AssetResult, AssetUploadProgress } from './asset-upload'

export const FIRMWARE_SELECT_SOURCE_CHANNEL = 'firmware-update:select-source' as const
export const FIRMWARE_UPLOAD_CHANNEL = 'firmware-update:upload' as const
export const FIRMWARE_CANCEL_UPLOAD_CHANNEL = 'firmware-update:cancel-upload' as const
export const FIRMWARE_UPLOAD_PROGRESS_CHANNEL = 'firmware-update:upload-progress' as const

export const FIRMWARE_PACKAGE_MAGIC = 0x5746_4353
export const FIRMWARE_FORMAT_VERSION = 1
export const FIRMWARE_HEADER_SIZE = 32
export const FIRMWARE_MANIFEST_ENTRY_SIZE = 2
export const FIRMWARE_IMAGE_OFFSET = 64
export const MAXIMUM_FIRMWARE_IMAGE_SIZE = 2560 * 1024

export interface FirmwareUpdateState {
  storageAvailable: boolean
  running: string
  target: string
  version: string
  pendingVerify: boolean
  rebootRequired: boolean
}

export interface FirmwareSourceSelection {
  id: string
  name: string
  size: number
}

export type FirmwareUploadProgress = AssetUploadProgress
export type FirmwareUpdateResult<T> = AssetResult<T>

export interface FirmwareUploadRequest {
  sourceId: string
}
