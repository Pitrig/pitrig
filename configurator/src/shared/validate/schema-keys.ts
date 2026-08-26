import {
  SCHEMA_CHILD_TYPES,
  SCHEMA_OBJECT_KEYS,
  SCHEMA_VARIANT_ARRAYS,
  SCHEMA_WIDGET_STRUCTS,
  TEXT_CAPACITIES,
  WIDGET_TYPES
} from '../configuration-schema'

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
      return `Unknown property "${here}" is not part of the configuration schema.`
    }
    const capacity = TEXT_CAPACITIES[`${structName}.${key}`]
    if (capacity !== undefined && typeof child === 'string') {
      const bytes = new TextEncoder().encode(child).byteLength
      if (bytes >= capacity) {
        return `"${here}" is ${bytes} bytes; the device stores at most ${capacity - 1}.`
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
  if (!Array.isArray(value)) return `"${path}" must be an array of widgets.`
  for (let index = 0; index < value.length; ++index) {
    const widget = value[index]
    const here = `${path}[${index}]`
    if (!isObject(widget)) return `"${here}" must be an object.`
    const type = (widget as { type?: unknown }).type
    if (typeof type !== 'string' || !WIDGET_TYPES.includes(type)) {
      return `"${here}.type" must be one of ${WIDGET_TYPES.join(', ')}.`
    }
    const structName = SCHEMA_WIDGET_STRUCTS[type]
    if (!structName) return `"${here}.type" must be one of ${WIDGET_TYPES.join(', ')}.`
    const error = findUnknownProperty(widget, structName, here)
    if (error) return error
  }
  return undefined
}
