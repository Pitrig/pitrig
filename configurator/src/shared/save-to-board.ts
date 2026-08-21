import type { ConfigurationDocumentId } from './configuration-schema'

// Saving a dashboard to a board is several device commands with one document
// riding on all of them: resolve the families it names, build the package,
// compare it with what is installed, upload only on a difference, and save the
// configuration. It lives in the main process because that is the only place
// that can hold the serial link for the whole sequence.
//
// The last step depends on what actually happened. A face the board did not
// have becomes usable only after a restart, so installing one ends in a restart
// and a reconnection. Nothing installed means nothing needs one: the document is
// written to NVS and then applied to the running dashboard, which is the same
// command the live preview uses. Saving therefore costs a restart only when a
// restart buys something — see docs/font-assets.md.

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
  /**
   * Which documents the save may write, out of those that actually differ.
   * Omitted means all of them, which is what the toolbar's "Save to board"
   * wants; the Configs page names one so a row can be saved on its own.
   */
  documents?: ConfigurationDocumentId[]
}

export interface SaveToBoardValue {
  /** The document the board accepted, as it parsed it. */
  configuration: unknown
  /** Whether a font package was actually sent, or the installed one matched. */
  fontsUploaded: boolean
  /**
   * Whether the board was restarted. False is the ordinary case: the saved
   * document was applied to the running dashboard instead.
   */
  restarted: boolean
  /**
   * Set when the board was restarted but did not come back on its port. The
   * save itself succeeded — flash is written — so this is a note, not a failure.
   */
  reconnectFailed?: boolean
  /**
   * Set when the document was saved but could not be applied to the running
   * dashboard. Also a note: the board shows the previous dashboard until it is
   * restarted, and it will start with the saved one.
   */
  applyFailed?: string
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
