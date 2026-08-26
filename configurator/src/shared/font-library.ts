import { FONT_FAMILY_PATTERN, MAXIMUM_FONT_PACKAGE_SIZE } from './font-assets'

export const FONT_LIBRARY_LIST_CHANNEL = 'font-library:list' as const
export const FONT_LIBRARY_FACES_CHANNEL = 'font-library:faces' as const
export const FONT_LIBRARY_IMPORT_CHANNEL = 'font-library:import' as const
export const FONT_LIBRARY_ADD_CHANNEL = 'font-library:add' as const
export const FONT_LIBRARY_REMOVE_CHANNEL = 'font-library:remove' as const
export const FONT_CATALOG_LIST_CHANNEL = 'font-catalog:list' as const
export const FONT_CATALOG_PREVIEW_CHANNEL = 'font-catalog:preview' as const
export const FONT_LIBRARY_CHANGED_CHANNEL = 'font-library:changed' as const

export const FONT_LIBRARY_FORMAT = 'simcore-font-library' as const
export const FONT_LIBRARY_FORMAT_VERSION = 1

export type FontOrigin = 'bundled' | 'imported' | 'google'

export type FontVariant = string

export interface FontVariantSource {
  family: string
  variant: FontVariant
}

export interface FontLibraryEntry {
  id: string
  name: string
  origin: FontOrigin
  category?: string
  source?: FontVariantSource
  bytes: number
  tabularDigits?: boolean
}

export interface FontLibrarySnapshot {
  entries: FontLibraryEntry[]
  unreadable: number
}

export interface FontFaceBytes {
  id: string
  bytes: Uint8Array
}

export interface FontFacesRequest {
  ids: string[]
}

export interface FontLibraryAddRequest {
  family: string
  variant: FontVariant
  category?: string
}

export interface FontLibraryImportRequest {
  id?: string
}

export interface FontLibraryIdRequest {
  id: string
}

export interface FontCatalogFamily {
  name: string
  category: string
  variants: FontVariant[]
}

export interface FontCatalogPreviewRequest {
  family: string
}

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

export const MAXIMUM_FACE_SIZE = MAXIMUM_FONT_PACKAGE_SIZE
export const MINIMUM_FACE_SIZE = 128

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

export function normalizeVariant(variant: string): FontVariant {
  const lower = variant.trim().toLowerCase()
  if (lower === 'regular' || lower === '') return '400'
  if (lower === 'italic') return '400italic'
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

function hash6(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; ++index) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36).padStart(6, '0').slice(-6)
}

export const FONT_PACKAGE_DATA_OFFSET = 4096

export interface FontPackageFootprint {
  families: number
  bytes: number
}

export function fontPackageFootprint(faceSizes: readonly number[]): FontPackageFootprint {
  let bytes = FONT_PACKAGE_DATA_OFFSET
  for (const size of faceSizes) {
    bytes = (bytes + 3) & ~3
    bytes += size
  }
  return { families: faceSizes.length, bytes }
}
