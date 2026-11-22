import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  isUiLanguage,
  matchUiLanguage,
  UI_LANGUAGE_GLOBAL,
  type UiLanguage
} from '../../shared/ui-language'

export const UI_LANGUAGE_FILE = join(app.getPath('userData'), 'language.json')

export function readChosenUiLanguage(): UiLanguage | null {
  try {
    const stored: unknown = JSON.parse(readFileSync(UI_LANGUAGE_FILE, 'utf8'))
    const language = (stored as { language?: unknown } | null)?.language
    return isUiLanguage(language) ? language : null
  } catch {
    return null
  }
}

export const SYSTEM_UI_LANGUAGE = matchUiLanguage(app.getPreferredSystemLanguages())

export const STARTUP_UI_LANGUAGE = readChosenUiLanguage() ?? SYSTEM_UI_LANGUAGE

Reflect.set(globalThis, UI_LANGUAGE_GLOBAL, STARTUP_UI_LANGUAGE)
