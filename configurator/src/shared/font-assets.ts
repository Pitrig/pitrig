import type {
  AssetError,
  AssetErrorCode,
  AssetResult,
  AssetUploadProgress,
  AssetUploadStage
} from './asset-upload'

export const FONT_CANCEL_UPLOAD_CHANNEL = 'font-assets:cancel-upload' as const
export const FONT_CLEAR_CHANNEL = 'font-assets:clear' as const

export const MAXIMUM_FONT_FAMILIES = 8
export const MAXIMUM_FONT_SIZE_PX = 255
export const MAXIMUM_FONT_PACKAGE_SIZE = 3 * 1024 * 1024
export const FONT_FAMILY_PATTERN = /^[a-z0-9_-]{1,31}$/

export const DEFAULT_FONT_FAMILY = 'roboto'

export interface FontAssetKey {
  family: string
  sizePx: number
}

export interface FontUploadRequest {
  families: string[]
}

export type FontUploadStage = AssetUploadStage
export type FontUploadProgress = AssetUploadProgress
export type FontAssetErrorCode = AssetErrorCode
export type FontAssetError = AssetError
export type FontAssetResult<T> = AssetResult<T>
