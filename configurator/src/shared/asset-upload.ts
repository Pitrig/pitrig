export type AssetUploadStage =
  | 'reading'
  | 'building'
  | 'erasing'
  | 'uploading'
  | 'committing'
  | 'completed'
  | 'cancelled'
  | 'error'

export interface AssetUploadProgress {
  stage: AssetUploadStage
  completed: number
  total: number
  message: string
}

export type AssetErrorCode =
  | 'busy'
  | 'cancelled'
  | 'device_error'
  | 'invalid_request'
  | 'package_too_large'
  | 'source_missing'
  | 'source_unreadable'
  | 'unsupported_firmware'

export interface AssetError {
  code: AssetErrorCode
  message: string
}

export type AssetResult<T> = { ok: true; value: T } | { ok: false; error: AssetError }
