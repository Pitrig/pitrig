const COLOR = /^#[0-9a-fA-F]{6}$/

export function authored<T>(current: T | undefined, fallback: T): boolean {
  if (current === undefined) return false
  if (
    typeof current === 'string' &&
    typeof fallback === 'string' &&
    COLOR.test(current) &&
    COLOR.test(fallback)
  ) {
    return current.toUpperCase() !== fallback.toUpperCase()
  }
  return current !== fallback
}
