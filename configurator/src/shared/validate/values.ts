import { TELEMETRY_CATALOG } from '../telemetry-catalog'
import { t } from '../ui-text'

export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export const DEFAULT_TEXT_BINDING = 'vehicle.speed'

export const MAXIMUM_DEVICE_REAL = 1e9

const BOOLEAN_VALUES = 'true, false'

const BINDINGS: ReadonlySet<string> = new Set<string>(TELEMETRY_CATALOG.map(({ name }) => name))

export function badEnum(
  value: unknown,
  values: readonly string[],
  label: string,
  key: string
): string | undefined {
  if (value === undefined) return undefined
  return values.includes(value as string)
    ? undefined
    : t('validation.ledValues.labelSetsKeyToValue', { label, key, value: JSON.stringify(value), join: values.join(', ') })
}

export function badBoolean(value: unknown, label: string, key: string): string | undefined {
  if (value === undefined || typeof value === 'boolean') return undefined
  return t('validation.ledValues.labelSetsKeyToValue', { label, key, value: JSON.stringify(value), join: BOOLEAN_VALUES })
}

export function badList(
  value: unknown,
  capacity: number,
  label: string,
  what: string
): string | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return t('validation.ledValues.labelMustCarryItsWhat', { label, what })
  if (value.length > capacity) {
    return t('validation.ledValues.labelCarriesLengthWhatThe', { label, length: value.length, what, capacity })
  }
  const stray = value.findIndex(
    (entry) => typeof entry !== 'object' || entry === null || Array.isArray(entry)
  )
  return stray < 0
    ? undefined
    : t('validation.ledValues.labelCarriesStrayAmongIts', { label, stray: JSON.stringify(value[stray]), what })
}

export function badColors(
  value: unknown,
  label: string,
  skipped: readonly string[] = []
): string | undefined {
  let error: string | undefined
  const walk = (entry: unknown, path: string): void => {
    if (error || entry === null || typeof entry !== 'object') return
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    for (const [key, item] of Object.entries(entry)) {
      if (error) return
      if (skipped.includes(key)) continue
      if (key === 'color' || key.endsWith('_color')) {
        if (typeof item !== 'string' || !COLOR_PATTERN.test(item)) {
          error = `${label} sets "${path ? `${path}.` : ''}${key}" to ${JSON.stringify(item)}; a colour is "#RRGGBB".`
          return
        }
        continue
      }
      walk(item, path ? `${path}.${key}` : key)
    }
  }
  walk(value, '')
  return error
}

export function badBinding(
  binding: string | undefined,
  fallback: string,
  label: string,
  what: string
): string | undefined {
  const name = binding ?? fallback
  if (BINDINGS.has(name)) return undefined
  return name === ''
    ? t('validation.widgetValues.whatOfLabelHasNo', { what, label })
    : t('validation.widgetValues.whatOfLabelReadsName', { what, label, name })
}

export function realFits(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAXIMUM_DEVICE_REAL)
  )
}

export function badReal(value: unknown, label: string, key: string): string | undefined {
  return realFits(value)
    ? undefined
    : t('validation.ledValues.labelSetsKeyToSomething', { label, key })
}
