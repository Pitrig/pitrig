import type {
  AssetError,
  AssetErrorCode,
  AssetResult,
  AssetUploadProgress,
  AssetUploadStage
} from './asset-upload'

export const FONT_SELECT_SOURCE_CHANNEL = 'font-assets:select-source' as const
export const FONT_UPLOAD_CHANNEL = 'font-assets:upload' as const
export const FONT_CANCEL_UPLOAD_CHANNEL = 'font-assets:cancel-upload' as const
export const FONT_CLEAR_CHANNEL = 'font-assets:clear' as const
export const FONT_UPLOAD_PROGRESS_CHANNEL = 'font-assets:upload-progress' as const

export const MAXIMUM_FONT_FAMILIES = 8
export const MAXIMUM_FONT_SIZE_PX = 255
export const MAXIMUM_FONT_PACKAGE_SIZE = 2 * 1024 * 1024
export const FONT_FAMILY_PATTERN = /^[a-z0-9_-]{1,31}$/

/**
 * The family a dashboard starts with when it names none yet. A family is an
 * author-chosen identifier that an uploaded face is bound to, so a document
 * with nothing in it still has to name one — the alternative is a widget with
 * no font, which the device rejects the whole document over. Naming it here
 * puts it straight into the font panel as required-but-missing, which is the
 * state the author can act on.
 */
export const DEFAULT_FONT_FAMILY = 'display'

export interface FontSourceSelection {
  id: string
  name: string
}

export interface FontAssetInput {
  sourceId: string
  family: string
}

export interface FontAssetKey {
  family: string
  sizePx: number
}

export interface FontUploadRequest {
  assets: FontAssetInput[]
}

// Fonts share the upload vocabulary with every other asset kind; these aliases
// keep the existing names working where the code reads better for it.
export type FontUploadStage = AssetUploadStage
export type FontUploadProgress = AssetUploadProgress
export type FontAssetErrorCode = AssetErrorCode
export type FontAssetError = AssetError
export type FontAssetResult<T> = AssetResult<T>
