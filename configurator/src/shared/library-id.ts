/**
 * The identifier scheme both on-disk libraries use — dashboard templates and
 * saved configurations.
 *
 * It is one implementation rather than two copies because it is the
 * path-traversal gate: an identifier that passes this is the only thing either
 * service ever allows to name a file, and a second copy is a copy that can drift
 * into allowing something the first would not.
 */

export const LIBRARY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/

/**
 * A display name reduced to something that can be a file name, the same way an
 * image source's name is reduced to an identifier the device accepts. Returns
 * nothing when the name holds no letter or digit at all.
 */
export function libraryIdFor(name: string): string | undefined {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return LIBRARY_ID_PATTERN.test(slug) ? slug : undefined
}
