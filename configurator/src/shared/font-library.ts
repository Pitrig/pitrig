import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_PACKAGE_SIZE } from './font-assets'

// The configurator's own store of font faces. A library entry *is* a device
// family: its id is the `family` string a widget carries, and its bytes are the
// face the board rasterizes. That equality is the whole point — the document
// needs no side table naming what `roboto-bold` stands for, and a dashboard
// authored on another machine resolves against that machine's library without
// carrying anything with it.
//
// The library is the author's and the package is the board's; they meet only
// when a configuration is saved. See
// docs/adr/0010-uploaded-font-assets.md.

export const FONT_LIBRARY_LIST_CHANNEL = 'font-library:list' as const
export const FONT_LIBRARY_FACES_CHANNEL = 'font-library:faces' as const
export const FONT_LIBRARY_IMPORT_CHANNEL = 'font-library:import' as const
export const FONT_LIBRARY_ADD_CHANNEL = 'font-library:add' as const
export const FONT_LIBRARY_REMOVE_CHANNEL = 'font-library:remove' as const
export const FONT_CATALOG_LIST_CHANNEL = 'font-catalog:list' as const
export const FONT_CATALOG_PREVIEW_CHANNEL = 'font-catalog:preview' as const
/** Main → renderer, whenever the entry set changes under the renderer's feet. */
export const FONT_LIBRARY_CHANGED_CHANNEL = 'font-library:changed' as const

export const FONT_LIBRARY_FORMAT = 'simcore-font-library' as const
export const FONT_LIBRARY_FORMAT_VERSION = 1

/**
 * Where a face came from, which is also what may be done to it: a bundled entry
 * ships with the application and cannot be removed or shadowed, the other two
 * live under the user data directory.
 */
export type FontOrigin = 'bundled' | 'imported' | 'google'

/**
 * A weight and style, normalised to the shape the Google Fonts metadata uses
 * once `regular`/`italic` are spelled out: `400`, `700`, `400italic`. It is
 * part of the identifier, never a property the device knows — the board holds
 * one face per family, so a weight is a family of its own.
 */
export type FontVariant = string

/** The catalog family and variant an entry was derived from, when it was. */
export interface FontVariantSource {
  family: string
  variant: FontVariant
}

export interface FontLibraryEntry {
  /** The `family` string a widget carries. Derived, never typed. */
  id: string
  /** What the picker shows. Never reaches the device. */
  name: string
  origin: FontOrigin
  category?: string
  source?: FontVariantSource
  /** Face size in bytes, which is what the eight slots are really spent on. */
  bytes: number
  /**
   * Whether the face draws its ten digits at one width, read out of its own
   * `hmtx` table. A dashboard is mostly numbers that change several times a
   * second, and proportional digits make the reading shift sideways as they do.
   * Undefined when the face could not be parsed.
   */
  tabularDigits?: boolean
}

export interface FontLibrarySnapshot {
  entries: FontLibraryEntry[]
  /**
   * Entries in the index whose face could not be read. One number, so a lost
   * file is a visible gap rather than a library that will not open.
   */
  unreadable: number
}

/**
 * Face bytes on their way to the renderer, which registers them as a
 * `FontFace`. They cross as bytes rather than as a URL because the renderer's
 * content policy allows `data:` for images alone, and `FontFace` takes a buffer.
 */
export interface FontFaceBytes {
  id: string
  bytes: Uint8Array
}

export interface FontFacesRequest {
  ids: string[]
}

/** Adds a catalog family+variant, downloading the face if it is not cached. */
export interface FontLibraryAddRequest {
  family: string
  variant: FontVariant
  category?: string
}

/**
 * Imports a file the author picked. `id` is optional: the import dialog fills
 * it from the file name, and the unresolved-font flow passes the id the
 * document already names so the face lands under exactly that family.
 */
export interface FontLibraryImportRequest {
  id?: string
}

export interface FontLibraryIdRequest {
  id: string
}

/**
 * One family the catalog offers, as the renderer sees it. The face URLs stay in
 * the main process on purpose: the renderer's content policy cannot reach
 * fonts.gstatic.com anyway, and a download target that never crosses the bridge
 * is one that cannot be talked into pointing somewhere else.
 */
export interface FontCatalogFamily {
  name: string
  category: string
  variants: FontVariant[]
}

/** Downloads a family's first variant so a picker row can draw itself. */
export interface FontCatalogPreviewRequest {
  family: string
}

/** The bytes and the id they were registered under, or null when unavailable. */
export interface FontCatalogPreview {
  family: string
  id: string
  bytes: Uint8Array
  tabularDigits?: boolean
}

export interface FontLibraryError {
  code:
    | 'invalid_request'
    | 'not_found'
    | 'read_only'
    | 'read_failed'
    | 'write_failed'
    | 'download_failed'
    | 'not_a_font'
    | 'id_taken'
    | 'limit_reached'
  message: string
}

export type FontLibraryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: FontLibraryError }

/** A face larger than the whole partition can never be installed. */
export const MAXIMUM_FACE_SIZE = MAXIMUM_FONT_PACKAGE_SIZE
/** The sfnt signature check, so a download that returned an error page fails here. */
export const MINIMUM_FACE_SIZE = 128

/**
 * The variant suffix an identifier carries. `400` is the unmarked case, so the
 * regular weight of a family reads as the family — `roboto`, not `roboto-400`.
 */
/**
 * The variant part of an identifier, separated by `_`.
 *
 * The underscore is load-bearing. `slugify` maps everything outside `[a-z0-9]`
 * to `-`, so a family's slug can never contain one — which is what keeps a
 * family *name* from being read as a variant. With `-` here, the family
 * "Archivo Black" and the family "Archivo" at weight 900 both derived
 * `archivo-black`, and two different faces sharing one identifier makes the
 * document key unsound. The catalog generator checks for exactly this.
 */
const WEIGHT_SUFFIXES: Readonly<Record<string, string>> = {
  '100': '_thin',
  '200': '_extralight',
  '300': '_light',
  '400': '',
  '500': '_medium',
  '600': '_semibold',
  '700': '_bold',
  '800': '_extrabold',
  '900': '_black'
}

/** `regular` and `italic` spelled as weights, so one shape covers every source. */
export function normalizeVariant(variant: string): FontVariant {
  const lower = variant.trim().toLowerCase()
  if (lower === 'regular' || lower === '') return '400'
  if (lower === 'italic') return '400italic'
  // The metadata endpoint writes italics as `700i`.
  const short = /^([1-9]00)i$/.exec(lower)
  if (short?.[1]) return `${short[1]}italic`
  return lower
}

export function variantSuffix(variant: FontVariant): string {
  const normalized = normalizeVariant(variant)
  const italic = normalized.endsWith('italic')
  const weight = italic ? normalized.slice(0, -'italic'.length) : normalized
  const suffix = WEIGHT_SUFFIXES[weight || '400']
  if (suffix === undefined) return italic ? `_w${weight}_italic` : `_w${weight}`
  return italic ? `${suffix}_italic` : suffix
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The identifier for one face. Derivation is pure and shared by every source,
 * because the document stores the result: two installations must reach the same
 * id for the same face or a dashboard stops resolving when it travels.
 *
 * The device's field holds 31 bytes. A name that would overflow it is truncated
 * and carries a hash of what it was — and *every* truncated name carries one,
 * which is what keeps a truncation from colliding with a short name that
 * happens to match its prefix.
 */
export function fontFamilyId(family: string, variant: FontVariant = '400'): string | undefined {
  const suffix = variantSuffix(variant)
  const base = slugify(family)
  if (!base) return undefined
  const budget = 31 - suffix.length
  const id =
    base.length <= budget
      ? base + suffix
      : `${trimDashes(base.slice(0, budget - 7))}_${hash6(`${family}|${normalizeVariant(variant)}`)}${suffix}`
  return FONT_FAMILY_PATTERN.test(id) ? id : undefined
}

function trimDashes(value: string): string {
  return value.replace(/^-+|-+$/g, '')
}

/** FNV-1a, base36, six characters. Short, stable, and needs no dependency. */
function hash6(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; ++index) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36).padStart(6, '0').slice(-6)
}

/** Where face data starts in the package: the header and manifest area. */
export const FONT_PACKAGE_DATA_OFFSET = 4096

export interface FontPackageFootprint {
  families: number
  bytes: number
}

/**
 * What the faces would occupy as an installed package. It mirrors the layout
 * `buildFontPackage` writes — the 4 KiB header and manifest area, then each
 * face at the next four-byte boundary — so the budget the editor shows and the
 * package the save actually builds cannot disagree.
 */
export function fontPackageFootprint(faceSizes: readonly number[]): FontPackageFootprint {
  let bytes = FONT_PACKAGE_DATA_OFFSET
  for (const size of faceSizes) {
    bytes = (bytes + 3) & ~3
    bytes += size
  }
  return { families: faceSizes.length, bytes }
}
