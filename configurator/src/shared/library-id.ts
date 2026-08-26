export const LIBRARY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/

export function libraryIdFor(name: string): string | undefined {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return LIBRARY_ID_PATTERN.test(slug) ? slug : undefined
}
