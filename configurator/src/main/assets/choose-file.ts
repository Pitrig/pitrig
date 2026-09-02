import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { t } from '@shared/ui-text'

export interface ChosenFile {
  id: string
  name: string
  path: string
}

export interface FileChoice {
  title: string
  buttonLabel: string
  filters: OpenDialogOptions['filters']
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

export const FONT_FILE_CHOICE: FileChoice = {
  title: t('assets.chooseFile.fontTitle'),
  buttonLabel: t('common.select'),
  filters: [{ name: t('assets.chooseFile.fontFilter'), extensions: ['ttf', 'otf'] }],
  extensions: ['.ttf', '.otf']
}
