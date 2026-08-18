import {
  SCHEMA_CHILD_TYPES,
  SCHEMA_OBJECT_KEYS,
  SCHEMA_VARIANT_ARRAYS,
  SCHEMA_WIDGET_STRUCTS,
  TEXT_CAPACITIES,
  WIDGET_TYPES
} from '../configuration-schema'

// Rejecting a property the schema does not declare. The allow-lists are the
// generated ones the firmware parser uses, so a document this accepts cannot
// be answered with unknown_property by the device.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Walks the document against the generated allow-lists, mirroring the firmware. */
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
    // Bounded strings are stored with a terminator, so the device rejects one
    // byte before the capacity. Catching it here names the property instead of
    // leaving the board to answer with a path.
    const capacity = TEXT_CAPACITIES[`${structName}.${key}`]
    if (capacity !== undefined && typeof child === 'string') {
      const bytes = new TextEncoder().encode(child).byteLength
      if (bytes >= capacity) {
        return `"${here}" is ${bytes} bytes; the device stores at most ${capacity - 1}.`
      }
    }
    // Widget arrays nest to any depth and are the same discriminated union
    // wherever they appear. Which properties hold one is generated, so a new
    // kind of parent cannot be silently skipped here.
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
    // Generated, so a new widget type cannot be silently checked against
    // another variant's properties.
    const structName = SCHEMA_WIDGET_STRUCTS[type]
    if (!structName) return `"${here}.type" must be one of ${WIDGET_TYPES.join(', ')}.`
    const error = findUnknownProperty(widget, structName, here)
    if (error) return error
  }
  return undefined
}

/**
 * The screen array is bounded on the device, and the editor only ever authors
 * the first one — but the advanced JSON editor can write any array, so the cap
 * belongs here rather than in the canvas.
 */
