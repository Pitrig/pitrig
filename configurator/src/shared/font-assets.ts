import type {
  AssetError,
  AssetErrorCode,
  AssetResult,
  AssetUploadProgress,
  AssetUploadStage
} from './asset-upload'

// There is no channel for starting a font upload. Installing a face is a
// consequence of saving a dashboard that needs it, so the save pipeline is the
// only caller — see shared/save-to-board.ts. Cancelling and erasing stay
// reachable, because those are things the author asks for directly.
export const FONT_CANCEL_UPLOAD_CHANNEL = 'font-assets:cancel-upload' as const
export const FONT_CLEAR_CHANNEL = 'font-assets:clear' as const

export const MAXIMUM_FONT_FAMILIES = 8
export const MAXIMUM_FONT_SIZE_PX = 255
export const MAXIMUM_FONT_PACKAGE_SIZE = 2 * 1024 * 1024
export const FONT_FAMILY_PATTERN = /^[a-z0-9_-]{1,31}$/

/**
 * The family a dashboard starts with when it names none yet. A document with
 * nothing in it still has to name one — the alternative is a widget with no
 * font, which the device rejects the whole document over.
 *
 * It must name a **bundled** library entry, so a fresh dashboard draws in its
 * real face before anything has been downloaded, imported or connected. Naming
 * something the library cannot answer for would put a brand-new document
 * straight into the unresolved-font flow.
 */
export const DEFAULT_FONT_FAMILY = 'roboto'

export interface FontAssetKey {
  family: string
  sizePx: number
}

/**
 * The families to install, and nothing else. A family identifier is a font
 * library id, so the faces are looked up rather than bound to picked files —
 * there is no second half of this request to keep in step with the first.
 */
export interface FontUploadRequest {
  families: string[]
}

// Fonts share the upload vocabulary with every other asset kind; these aliases
// keep the existing names working where the code reads better for it.
export type FontUploadStage = AssetUploadStage
export type FontUploadProgress = AssetUploadProgress
export type FontAssetErrorCode = AssetErrorCode
export type FontAssetError = AssetError
export type FontAssetResult<T> = AssetResult<T>
