import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'

// Opening a file dialog and checking what came back is the same act for an
// asset upload and for a font import, and the two disagreeing about which
// extensions count is exactly the kind of drift worth one shared function.

export interface ChosenFile {
  id: string
  name: string
  path: string
}

export interface FileChoice {
  title: string
  buttonLabel: string
  filters: OpenDialogOptions['filters']
  /** Lowercase, with the dot. Re-checked here because a dialog filter is a hint. */
  extensions: readonly string[]
}

export type FileChoiceOutcome =
  | { kind: 'chosen'; file: ChosenFile }
  | { kind: 'cancelled' }
  | { kind: 'wrong_extension' }

export async function chooseFile(
  choice: FileChoice,
  owner?: BrowserWindow
): Promise<FileChoiceOutcome> {
  const options: OpenDialogOptions = {
    title: choice.title,
    buttonLabel: choice.buttonLabel,
    properties: ['openFile'],
    filters: choice.filters
  }
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return { kind: 'cancelled' }
  const path = result.filePaths[0]
  if (!path || !choice.extensions.includes(extname(path).toLowerCase())) {
    return { kind: 'wrong_extension' }
  }
  return { kind: 'chosen', file: { id: randomUUID(), name: basename(path), path } }
}

/** The one both the font library and the font upload open. */
export const FONT_FILE_CHOICE: FileChoice = {
  title: 'Select a font face',
  buttonLabel: 'Select',
  filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }],
  extensions: ['.ttf', '.otf']
}
