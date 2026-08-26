import type { ConfigurationDocumentId } from './configuration-schema'

export const SAVE_TO_BOARD_CHANNEL = 'save:to-board' as const
export const SAVE_PROGRESS_CHANNEL = 'save:progress' as const

export type SaveStage =
  | 'preparing'
  | 'building'
  | 'uploading'
  | 'saving'
  | 'applying'
  | 'rebooting'
  | 'reconnecting'
  | 'completed'

export interface SaveProgress {
  stage: SaveStage
  completed: number
  total: number
  message: string
}

export interface SaveToBoardRequest {
  json: string
  documents?: ConfigurationDocumentId[]
}

export interface SaveToBoardValue {
  configuration: unknown
  fontsUploaded: boolean
  restarted: boolean
  reconnectFailed?: boolean
  applyFailed?: string
}

export interface UnresolvedFontsError {
  code: 'fonts_unresolved'
  message: string
  families: string[]
}

export interface SaveToBoardError {
  code:
    | 'invalid_configuration'
    | 'busy'
    | 'device_error'
    | 'font_upload_failed'
  message: string
}

export type SaveToBoardResult =
  | { ok: true; value: SaveToBoardValue }
  | { ok: false; error: SaveToBoardError | UnresolvedFontsError }

export function isUnresolvedFonts(
  error: SaveToBoardError | UnresolvedFontsError
): error is UnresolvedFontsError {
  return error.code === 'fonts_unresolved'
}
