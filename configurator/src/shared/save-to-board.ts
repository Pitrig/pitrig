// Saving a dashboard to a board is several device commands with one document
// riding on all of them: resolve the families it names, build the package,
// compare it with what is installed, upload only on a difference, save the
// configuration, restart, and come back. It lives in the main process because
// that is the only place that can hold the serial link for the whole sequence.

export const SAVE_TO_BOARD_CHANNEL = 'save:to-board' as const
export const SAVE_PROGRESS_CHANNEL = 'save:progress' as const

export type SaveStage =
  | 'preparing'
  | 'building'
  | 'uploading'
  | 'saving'
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
}

export interface SaveToBoardValue {
  /** The document the board accepted, as it parsed it. */
  configuration: unknown
  /** Whether a font package was actually sent, or the installed one matched. */
  fontsUploaded: boolean
  /**
   * Set when the board was restarted but did not come back on its port. The
   * save itself succeeded — flash is written — so this is a note, not a failure.
   */
  reconnectFailed?: boolean
}

/**
 * The one refusal the author can act on directly: families the library cannot
 * answer for. Nothing is written to the board when this comes back, so the
 * dashboard on it is exactly as it was.
 */
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
