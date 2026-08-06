export const FONT_SELECT_SOURCE_CHANNEL = 'font-assets:select-source' as const
export const FONT_UPLOAD_CHANNEL = 'font-assets:upload' as const
export const FONT_CANCEL_UPLOAD_CHANNEL = 'font-assets:cancel-upload' as const
export const FONT_UPLOAD_PROGRESS_CHANNEL = 'font-assets:upload-progress' as const

export const MAXIMUM_FONT_ASSETS = 32
export const MAXIMUM_FONT_SIZE_PX = 255
export const MAXIMUM_FONT_PACKAGE_SIZE = 2 * 1024 * 1024
export const FONT_FAMILY_PATTERN = /^[a-z0-9_-]{1,31}$/

export interface FontSourceSelection {
  id: string
  name: string
}

export interface FontAssetInput {
  sourceId: string
  family: string
  sizePx: number
}

export interface FontAssetKey {
  family: string
  sizePx: number
}

export interface FontUploadRequest {
  assets: FontAssetInput[]
}

export type FontUploadStage =
  | 'converting'
  | 'building'
  | 'erasing'
  | 'uploading'
  | 'committing'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface FontUploadProgress {
  stage: FontUploadStage
  completed: number
  total: number
  message: string
}

export type FontAssetErrorCode =
  | 'busy'
  | 'cancelled'
  | 'conversion_failed'
  | 'device_error'
  | 'invalid_request'
  | 'package_too_large'
  | 'source_missing'
  | 'unsupported_firmware'

export interface FontAssetError {
  code: FontAssetErrorCode
  message: string
}

export type FontAssetResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: FontAssetError }
