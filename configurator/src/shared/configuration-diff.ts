import type { ApplicationConfiguration } from './configuration-schema'

export type ConfigurationChangeKind = 'added' | 'removed' | 'changed'

export interface ConfigurationChange {
  kind: ConfigurationChangeKind
  path: string
  before?: string
  after?: string
}

export interface ConfigurationDiff {
  changes: ConfigurationChange[]
  truncated: number
}

const MAXIMUM_CHANGES = 200
const MAXIMUM_VALUE_LENGTH = 48

export function diffConfigurations(
  before: ApplicationConfiguration | undefined,
  after: ApplicationConfiguration | undefined
): ConfigurationDiff {
  const changes: ConfigurationChange[] = []
  let truncated = 0
  const record = (change: ConfigurationChange): void => {
    if (changes.length >= MAXIMUM_CHANGES) {
      truncated += 1
      return
    }
    changes.push(change)
  }
  walk(before, after, [], record)
  return { changes, truncated }
}

type Emit = (change: ConfigurationChange) => void

function walk(before: unknown, after: unknown, path: string[], emit: Emit): void {
  if (before === after) return
  if (before === undefined) {
    emit({ kind: 'added', path: label(path), after: describe(after) })
    return
  }
  if (after === undefined) {
    emit({ kind: 'removed', path: label(path), before: describe(before) })
    return
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    walkArray(before, after, path, emit)
    return
  }
  if (isRecord(before) && isRecord(after)) {
    for (const key of union(Object.keys(before), Object.keys(after))) {
      walk(before[key], after[key], [...path, key], emit)
    }
    return
  }
  if (before !== after) {
    emit({ kind: 'changed', path: label(path), before: describe(before), after: describe(after) })
  }
}

function walkArray(before: unknown[], after: unknown[], path: string[], emit: Emit): void {
  const beforeIds = identifiers(before)
  const afterIds = identifiers(after)
  if (!beforeIds || !afterIds) {
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index += 1) {
      walk(before[index], after[index], [...path, `[${index}]`], emit)
    }
    return
  }

  for (const [id, element] of beforeIds) {
    walk(element, afterIds.get(id), [...path, elementLabel(id, element)], emit)
  }
  for (const [id, element] of afterIds) {
    if (!beforeIds.has(id)) {
      walk(undefined, element, [...path, elementLabel(id, element)], emit)
    }
  }

  const common = [...beforeIds.keys()].filter((id) => afterIds.has(id))
  const reordered = [...afterIds.keys()].filter((id) => beforeIds.has(id))
  if (common.length > 1 && common.some((id, index) => reordered[index] !== id)) {
    emit({
      kind: 'changed',
      path: label(path),
      before: 'order',
      after: 'reordered'
    })
  }
}

function identifiers(elements: unknown[]): Map<string, Record<string, unknown>> | undefined {
  const keyed = new Map<string, Record<string, unknown>>()
  for (const element of elements) {
    if (!isRecord(element)) return undefined
    const id = element.id
    if (typeof id !== 'string' || id.length === 0 || keyed.has(id)) return undefined
    keyed.set(id, element)
  }
  return elements.length > 0 ? keyed : undefined
}

function elementLabel(id: string, element: Record<string, unknown>): string {
  const type = element.type
  return typeof type === 'string' ? `${id} (${type})` : id
}

function label(path: string[]): string {
  return path.length > 0 ? path.join(' › ') : 'configuration'
}

function describe(value: unknown): string {
  if (value === null) return 'none'
  if (typeof value === 'string') return value.length > 0 ? truncate(value) : '""'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.length === 1 ? '1 entry' : `${value.length} entries`
  }
  if (isRecord(value)) {
    const type = value.type
    if (typeof type === 'string') return type
    const keys = Object.keys(value)
    return keys.length <= 3 ? `{ ${keys.join(', ')} }` : `${keys.length} properties`
  }
  return truncate(String(value))
}

function truncate(text: string): string {
  return text.length > MAXIMUM_VALUE_LENGTH ? `${text.slice(0, MAXIMUM_VALUE_LENGTH - 1)}…` : text
}

function union(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
