export function layerShape(value: unknown, omit: ReadonlySet<string>): string {
  if (Array.isArray(value)) return `[${value.map((entry) => layerShape(entry, new Set())).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !omit.has(key))
      .sort(([first], [second]) => first.localeCompare(second))
    return `{${entries.map(([key, entry]) => `${key}:${layerShape(entry, new Set())}`).join(',')}}`
  }
  return JSON.stringify(value)
}
