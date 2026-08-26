export function authored<T>(current: T | undefined, fallback: T): boolean {
  return current !== undefined && current !== fallback
}
