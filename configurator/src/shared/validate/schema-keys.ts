import {
  SCHEMA_CHILD_TYPES,
  SCHEMA_OBJECT_KEYS,
  SCHEMA_VARIANT_ARRAYS,
  SCHEMA_WIDGET_STRUCTS,
  TEXT_CAPACITIES,
  WIDGET_TYPES
} from '../configuration-schema'
import { t } from '../ui-text'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function findUnknownProperty(
  node: unknown,
  structName: string,
  path: string
): string | undefined {
  if (!isObject(node)) return undefined
  const allowed = SCHEMA_OBJECT_KEYS[structName]
  const children = SCHEMA_CHILD_TYPES[structName] ?? {}
  for (const [key, child] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key
    if (allowed && !allowed.includes(key)) {
      return t('validation.schemaKeys.unknownPropertyHereIsNot', { here: here })
    }
    const capacity = TEXT_CAPACITIES[`${structName}.${key}`]
    if (capacity !== undefined && typeof child === 'string') {
      const bytes = new TextEncoder().encode(child).byteLength
      if (bytes >= capacity) {
        return t('validation.schemaKeys.hereIsBytesBytesThe', { here, bytes, capacity: capacity - 1 })
      }
    }
    if (SCHEMA_VARIANT_ARRAYS[structName]?.includes(key)) {
      const error = checkWidgets(child, here)
      if (error) return error
      continue
    }
    const childType = children[key]
    if (!childType) continue
    if (Array.isArray(child)) {
      for (let index = 0; index < child.length; ++index) {
        const error = findUnknownProperty(child[index], childType, `${here}[${index}]`)
        if (error) return error
      }
      continue
    }
    const error = findUnknownProperty(child, childType, here)
    if (error) return error
  }
  return undefined
}

function checkWidgets(value: unknown, path: string): string | undefined {
  if (!Array.isArray(value)) return t('validation.schemaKeys.pathMustBeAnArray', { path: path })
  for (let index = 0; index < value.length; ++index) {
    const widget = value[index]
    const here = `${path}[${index}]`
    if (!isObject(widget)) return t('validation.schemaKeys.hereMustBeAnObject', { here: here })
    const type = (widget as { type?: unknown }).type
    if (typeof type !== 'string' || !WIDGET_TYPES.includes(type)) {
      return t('validation.schemaKeys.hereTypeMustBeOne', { here: here, join: WIDGET_TYPES.join(', ') })
    }
    const structName = SCHEMA_WIDGET_STRUCTS[type]
    if (!structName) return t('validation.schemaKeys.hereTypeMustBeOne', { here: here, join: WIDGET_TYPES.join(', ') })
    const error = findUnknownProperty(widget, structName, here)
    if (error) return error
  }
  return undefined
}
