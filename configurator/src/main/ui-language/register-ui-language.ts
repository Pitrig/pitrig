import { app, ipcMain } from 'electron'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  isUiLanguage,
  UI_LANGUAGE_GET_CHANNEL,
  UI_LANGUAGE_RESTART_CHANNEL,
  UI_LANGUAGE_SET_CHANNEL,
  type UiLanguage,
  type UiLanguageSetRequest,
  type UiLanguageSettings
} from '../../shared/ui-language'
import { isDevelopment } from '../app-window'
import { writeFileAtomic } from '../write-file-atomic'
import {
  readChosenUiLanguage,
  STARTUP_UI_LANGUAGE,
  SYSTEM_UI_LANGUAGE,
  UI_LANGUAGE_FILE
} from './startup-language'

function settings(): UiLanguageSettings {
  return {
    active: STARTUP_UI_LANGUAGE,
    chosen: readChosenUiLanguage(),
    system: SYSTEM_UI_LANGUAGE,
    canRestart: !isDevelopment()
  }
}

async function choose(language: UiLanguage | null): Promise<void> {
  try {
    await mkdir(dirname(UI_LANGUAGE_FILE), { recursive: true })
    await writeFileAtomic(UI_LANGUAGE_FILE, `${JSON.stringify({ language }, null, 2)}\n`)
  } catch (error) {
    console.error('[ui-language] could not save the language', error)
  }
}

export function registerUiLanguage(whenBoardIdle: () => Promise<void>): void {
  ipcMain.handle(UI_LANGUAGE_GET_CHANNEL, settings)
  ipcMain.handle(UI_LANGUAGE_SET_CHANNEL, async (_event, request: unknown) => {
    const language = (request as Partial<UiLanguageSetRequest> | null)?.language
    if (language === null || isUiLanguage(language)) await choose(language)
    return settings()
  })
  ipcMain.handle(UI_LANGUAGE_RESTART_CHANNEL, async () => {
    if (isDevelopment()) return false
    await whenBoardIdle()
    app.relaunch()
    app.quit()
    return true
  })
}
