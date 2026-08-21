import { readFile } from 'node:fs/promises'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import {
  FONT_LIBRARY_FORMAT,
  FONT_LIBRARY_FORMAT_VERSION,
  MAXIMUM_FACE_SIZE,
  MINIMUM_FACE_SIZE,
  normalizeVariant,
  type FontLibraryError,
  type FontLibraryResult,
  type FontVariant
} from '../../shared/font-library'

// The file-format half of the font library: what one index record looks like,
// how a face file is judged to be a font at all, and the naming a Google
// variant is listed under. The service in font-library-service.ts owns the
// directory and the flows; nothing here touches its state.

export const FACE_EXTENSION = '.ttf'

// TrueType, OpenType/CFF, the legacy Apple tag and a collection — the same four
// the firmware accepts, checked here so a truncated download or an HTML error
// page never becomes a library entry.
const SFNT_SIGNATURES = [0x00010000, 0x4f54544f, 0x74727565, 0x74746366] as const

/** One record in library.json. Bundled faces are not listed; they are code. */
export interface StoredEntry {
  id: string
  name: string
  origin: 'imported' | 'google'
  category?: string
  source?: { family: string; variant: FontVariant }
  file: string
  bytes: number
  tabularDigits?: boolean
}

export interface StoredIndex {
  format: typeof FONT_LIBRARY_FORMAT
  format_version: number
  entries: StoredEntry[]
}

export async function readFaceFile(path: string): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await readFile(path))
  } catch {
    return undefined
  }
}

export function faceProblem(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength < MINIMUM_FACE_SIZE) return 'That file is too small to be a font face.'
  if (bytes.byteLength > MAXIMUM_FACE_SIZE) {
    return 'That face is larger than the whole 2 MiB font partition.'
  }
  const signature = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false)
  return SFNT_SIGNATURES.some((candidate) => candidate === signature)
    ? undefined
    : 'That file is not a TTF or OTF font face.'
}

export function displayName(family: string, variant: FontVariant): string {
  const normalized = normalizeVariant(variant)
  const italic = normalized.endsWith('italic')
  const weight = italic ? normalized.slice(0, -'italic'.length) : normalized
  const weightName = WEIGHT_NAMES[weight] ?? weight
  const parts = [family]
  if (weightName) parts.push(weightName)
  if (italic) parts.push('Italic')
  return parts.join(' ')
}

const WEIGHT_NAMES: Readonly<Record<string, string>> = {
  '100': 'Thin',
  '200': 'ExtraLight',
  '300': 'Light',
  '400': '',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
  '800': 'ExtraBold',
  '900': 'Black'
}

export function parseIndex(value: unknown): StoredIndex {
  if (typeof value !== 'object' || value === null) throw new Error('not an object')
  const record = value as Record<string, unknown>
  if (record.format !== FONT_LIBRARY_FORMAT) throw new Error('not a font library')
  const entries = Array.isArray(record.entries) ? record.entries : []
  return {
    format: FONT_LIBRARY_FORMAT,
    format_version: FONT_LIBRARY_FORMAT_VERSION,
    entries: entries.filter(isStoredEntry)
  }
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    FONT_FAMILY_PATTERN.test(entry.id) &&
    typeof entry.name === 'string' &&
    (entry.origin === 'imported' || entry.origin === 'google') &&
    typeof entry.file === 'string' &&
    // The file name is derived from the id, so a record naming anything else is
    // a record that could reach outside the faces directory.
    entry.file === `${entry.id}${FACE_EXTENSION}` &&
    typeof entry.bytes === 'number'
  )
}

/** Omitted rather than set to undefined, so an entry round-trips through JSON. */
export function optionalTabular(tabular: boolean | undefined): { tabularDigits?: boolean } {
  return tabular === undefined ? {} : { tabularDigits: tabular }
}

export function failure<T>(code: FontLibraryError['code'], message: string): FontLibraryResult<T> {
  return { ok: false, error: { code, message } }
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
