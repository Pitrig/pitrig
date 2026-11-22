import { isUiLanguage, UI_LANGUAGE_GLOBAL, type UiLanguage } from './ui-language'
import type { UiStringKey, UiStringParameters } from './ui-string-keys'
import { EN_UI_STRINGS } from './ui-strings-en'
import { KO_UI_STRINGS } from './ui-strings-ko'
import { PL_UI_STRINGS } from './ui-strings-pl'
import { UK_UI_STRINGS } from './ui-strings-uk'

type UiStringValues<K extends UiStringKey> = K extends keyof UiStringParameters
  ? [UiStringParameters[K]]
  : []

type UiStringArguments = Readonly<Record<string, string | number>>

const CATALOGS: Readonly<Record<UiLanguage, Readonly<Record<string, string>>>> = {
  en: EN_UI_STRINGS,
  uk: UK_UI_STRINGS,
  ko: KO_UI_STRINGS,
  pl: PL_UI_STRINGS
}

const injected: unknown = Reflect.get(globalThis, UI_LANGUAGE_GLOBAL)

export const UI_LANGUAGE: UiLanguage = isUiLanguage(injected) ? injected : 'en'

const CATALOG = CATALOGS[UI_LANGUAGE]
const PLURALS = new Intl.PluralRules(UI_LANGUAGE)
const PLACEHOLDER = /\{(\w+)\}/g

function templateOf(key: string, values: UiStringArguments | undefined): string {
  const count = values?.count
  if (typeof count === 'number') {
    const form = CATALOG[`${key}#${PLURALS.select(count)}`] ?? CATALOG[`${key}#other`]
    if (form !== undefined) return form
  }
  return CATALOG[key] ?? EN_UI_STRINGS[key] ?? key
}

export function formatList(entries: readonly string[], shown: number): string {
  const head = entries.slice(0, shown)
  const rest = entries.length - head.length
  return rest > 0
    ? t('common.listAndMore', { shown: head.join(', '), rest })
    : head.join(', ')
}

export function t<K extends UiStringKey>(key: K, ...values: UiStringValues<K>): string {
  const parameters = values[0] as UiStringArguments | undefined
  const template = templateOf(key, parameters)
  if (parameters === undefined) return template
  return template.replace(PLACEHOLDER, (hole, name: string) => {
    const value = parameters[name]
    return value === undefined ? hole : String(value)
  })
}
