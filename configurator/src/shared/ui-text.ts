import type { UiStringKey, UiStringParameters } from './ui-string-keys'
import { EN_UI_STRINGS } from './ui-strings-en'

type UiStringValues<K extends UiStringKey> = K extends keyof UiStringParameters
  ? [UiStringParameters[K]]
  : []

type UiStringArguments = Readonly<Record<string, string | number>>

const CATALOGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: EN_UI_STRINGS
}

const LOCALE = 'en'
const PLURALS = new Intl.PluralRules(LOCALE)
const PLACEHOLDER = /\{(\w+)\}/g

function templateOf(key: string, values: UiStringArguments | undefined): string {
  const catalog = CATALOGS[LOCALE] ?? EN_UI_STRINGS
  const count = values?.count
  if (typeof count === 'number') {
    const form = catalog[`${key}#${PLURALS.select(count)}`] ?? catalog[`${key}#other`]
    if (form !== undefined) return form
  }
  return catalog[key] ?? EN_UI_STRINGS[key] ?? key
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
