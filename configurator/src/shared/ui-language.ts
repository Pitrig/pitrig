export const UI_LANGUAGES = ['en', 'uk', 'ko', 'pl'] as const

export type UiLanguage = (typeof UI_LANGUAGES)[number]

export const UI_LANGUAGE_NAMES: Readonly<Record<UiLanguage, string>> = {
  en: 'English',
  uk: 'Українська',
  ko: '한국어',
  pl: 'Polski'
}

export const MACHINE_TRANSLATED_LANGUAGES: ReadonlySet<UiLanguage> = new Set<UiLanguage>(['ko', 'pl'])

export const UI_LANGUAGE_GLOBAL = 'pitrigUiLanguage'
export const UI_LANGUAGE_ARGUMENT = '--pitrig-ui-language='

export const UI_LANGUAGE_GET_CHANNEL = 'ui-language:get' as const
export const UI_LANGUAGE_SET_CHANNEL = 'ui-language:set' as const
export const UI_LANGUAGE_RESTART_CHANNEL = 'ui-language:restart' as const

export interface UiLanguageSettings {
  active: UiLanguage
  chosen: UiLanguage | null
  system: UiLanguage
  canRestart: boolean
}

export interface UiLanguageSetRequest {
  language: UiLanguage | null
}

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value)
}

export function matchUiLanguage(preferred: readonly string[]): UiLanguage {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/, 1)[0]
    if (isUiLanguage(base)) return base
  }
  return 'en'
}

export function uiLanguageFromArguments(argv: readonly string[]): UiLanguage {
  const value = argv
    .find((entry) => entry.startsWith(UI_LANGUAGE_ARGUMENT))
    ?.slice(UI_LANGUAGE_ARGUMENT.length)
  return isUiLanguage(value) ? value : 'en'
}
