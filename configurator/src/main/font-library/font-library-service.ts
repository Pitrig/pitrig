import type { BrowserWindow } from 'electron'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import {
  FONT_LIBRARY_FORMAT,
  FONT_LIBRARY_FORMAT_VERSION,
  MAXIMUM_FACE_SIZE,
  MINIMUM_FACE_SIZE,
  fontFamilyId,
  normalizeVariant,
  type FontFaceBytes,
  type FontLibraryEntry,
  type FontLibraryError,
  type FontLibraryResult,
  type FontLibrarySnapshot,
  type FontVariant
} from '../../shared/font-library'
import { FONT_FILE_CHOICE, chooseFile } from '../assets/choose-file'
import { BUNDLED_FACES } from './bundled-faces'
import { hasTabularDigits } from './font-metrics'

const INDEX_FILE = 'library.json'
const FACES_DIRECTORY = 'faces'
const FACE_EXTENSION = '.ttf'
/**
 * Enough that no author meets it while authoring, and small enough that a
 * runaway import loop cannot fill the disk. The device's eight families are a
 * separate, much smaller limit that the editor enforces per dashboard.
 */
const MAXIMUM_USER_FACES = 256

// TrueType, OpenType/CFF, the legacy Apple tag and a collection — the same four
// the firmware accepts, checked here so a truncated download or an HTML error
// page never becomes a library entry.
const SFNT_SIGNATURES = [0x00010000, 0x4f54544f, 0x74727565, 0x74746366] as const

/** One record in library.json. Bundled faces are not listed; they are code. */
interface StoredEntry {
  id: string
  name: string
  origin: 'imported' | 'google'
  category?: string
  source?: { family: string; variant: FontVariant }
  file: string
  bytes: number
  tabularDigits?: boolean
}

interface StoredIndex {
  format: typeof FONT_LIBRARY_FORMAT
  format_version: number
  entries: StoredEntry[]
}

/**
 * The configurator's font faces: the set bundled with the application, the ones
 * downloaded from the Google Fonts catalog, and the files the author imported.
 *
 * A library entry is a device family — its id is the `family` string a widget
 * carries. That is what lets a document travel: it names an id, and any
 * installation whose library answers to that id draws it and can install it.
 * Nothing here knows about a board, a package or an upload; saving asks this
 * for bytes and does the rest.
 */
export class FontLibraryService {
  private readonly facesDirectory: string
  private readonly indexPath: string
  private index: StoredIndex = {
    format: FONT_LIBRARY_FORMAT,
    format_version: FONT_LIBRARY_FORMAT_VERSION,
    entries: []
  }
  private unreadable = 0
  private loaded = false
  /** Bundled face sizes, read once: they are files beside the bundle, not index records. */
  private bundledSizes: Map<string, number> | undefined
  /** `null` records "parsed, and the answer is unknown", so it is not re-read. */
  private readonly bundledTabular = new Map<string, boolean | null>()

  constructor(
    private readonly directory: string,
    /** Where uploads used to cache their faces, adopted once at first start. */
    private readonly legacyFontCacheDirectory?: string
  ) {
    this.facesDirectory = join(directory, FACES_DIRECTORY)
    this.indexPath = join(directory, INDEX_FILE)
  }

  async list(): Promise<FontLibrarySnapshot> {
    await this.load()
    const sizes = await this.bundledFaceSizes()
    const entries: FontLibraryEntry[] = []
    for (const face of BUNDLED_FACES) {
      entries.push({
        id: face.id,
        name: face.name,
        origin: 'bundled',
        category: face.category,
        source: { family: face.family, variant: face.variant },
        // The real size, because the budget the editor shows is spent on these
        // as much as on an imported face.
        bytes: sizes.get(face.id) ?? 0,
        ...optionalTabular(await this.tabularDigitsOf(face.id))
      })
    }
    for (const stored of this.index.entries) {
      entries.push({
        id: stored.id,
        name: stored.name,
        origin: stored.origin,
        category: stored.category,
        source: stored.source,
        bytes: stored.bytes,
        ...optionalTabular(stored.tabularDigits)
      })
    }
    return { entries, unreadable: this.unreadable }
  }

  /**
   * Read from the face and remembered, because a bundled entry has no index
   * record to carry it and reading eight faces on every listing would make the
   * picker wait on disk for an answer that cannot change.
   */
  private async tabularDigitsOf(id: string): Promise<boolean | undefined> {
    const known = this.bundledTabular.get(id)
    if (known !== undefined) return known ?? undefined
    const bytes = await this.readFace(id)
    const tabular = bytes ? hasTabularDigits(bytes) : undefined
    this.bundledTabular.set(id, tabular ?? null)
    return tabular
  }

  /**
   * The face bytes for one id, or undefined when nothing answers to it. This is
   * the only way out of the library, and both the preview and the package
   * builder go through it.
   */
  async readFace(id: string): Promise<Uint8Array | undefined> {
    await this.load()
    const bundled = BUNDLED_FACES.find((face) => face.id === id)
    if (bundled) return readFaceFile(bundled.path)
    const stored = this.index.entries.find((entry) => entry.id === id)
    if (!stored) return undefined
    return readFaceFile(join(this.facesDirectory, stored.file))
  }

  /** The faces the renderer needs to register, skipping the ones it cannot. */
  async readFaces(ids: readonly string[]): Promise<FontFaceBytes[]> {
    const faces: FontFaceBytes[] = []
    for (const id of new Set(ids)) {
      const bytes = await this.readFace(id)
      if (bytes) faces.push({ id, bytes })
    }
    return faces
  }

  /** Which of the requested ids the library cannot answer for. */
  async unresolved(ids: readonly string[]): Promise<string[]> {
    await this.load()
    const known = new Set<string>([
      ...BUNDLED_FACES.map((face) => face.id),
      ...this.index.entries.map((entry) => entry.id)
    ])
    return [...new Set(ids)].filter((id) => !known.has(id)).sort()
  }

  /**
   * Imports a file the author picks. `id` is optional: the picker fills it from
   * the file name, and the unresolved-font flow passes the id a document
   * already names so the face lands under exactly that family.
   */
  async import(
    id: string | undefined,
    owner?: BrowserWindow
  ): Promise<FontLibraryResult<FontLibraryEntry | null>> {
    await this.load()
    if (id !== undefined && !FONT_FAMILY_PATTERN.test(id)) {
      return failure('invalid_request', `"${id}" is not a valid font family identifier.`)
    }
    if (id !== undefined && this.has(id)) {
      return failure('id_taken', `The library already holds a font called "${id}".`)
    }
    if (this.index.entries.length >= MAXIMUM_USER_FACES) {
      return failure('limit_reached', `The library holds at most ${MAXIMUM_USER_FACES} imported faces.`)
    }

    const outcome = await chooseFile(FONT_FILE_CHOICE, owner)
    if (outcome.kind === 'cancelled') return { ok: true, value: null }
    if (outcome.kind === 'wrong_extension') {
      return failure('not_a_font', 'Select a TTF or OTF font file.')
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(outcome.file.path))
    } catch (error) {
      return failure('read_failed', messageOf(error, 'The font file could not be read.'))
    }
    const invalid = faceProblem(bytes)
    if (invalid) return failure('not_a_font', invalid)

    const name = outcome.file.name.replace(/\.[^.]+$/, '')
    // Nothing parses the face, so the file's own name is the only name there
    // is; a variant is the author's claim rather than something read from it.
    const resolved = id ?? fontFamilyId(name)
    if (!resolved) {
      return failure('invalid_request', `"${name}" does not reduce to a font family identifier.`)
    }
    if (this.has(resolved)) {
      return failure('id_taken', `The library already holds a font called "${resolved}".`)
    }
    return this.store({
      id: resolved,
      name: name || resolved,
      origin: 'imported',
      file: `${resolved}${FACE_EXTENSION}`,
      bytes: bytes.byteLength,
      ...optionalTabular(hasTabularDigits(bytes))
    }, bytes)
  }

  /**
   * Adds a face fetched from the Google Fonts catalog. The caller supplies the
   * bytes because downloading is the catalog's job, not the library's.
   */
  async addDownloaded(
    family: string,
    variant: FontVariant,
    category: string | undefined,
    bytes: Uint8Array
  ): Promise<FontLibraryResult<FontLibraryEntry>> {
    await this.load()
    const id = fontFamilyId(family, variant)
    if (!id) {
      return failure('invalid_request', `"${family}" does not reduce to a font family identifier.`)
    }
    const existing = await this.entry(id)
    if (existing) return { ok: true, value: existing }
    const invalid = faceProblem(bytes)
    if (invalid) return failure('not_a_font', invalid)
    return this.store({
      id,
      name: displayName(family, variant),
      origin: 'google',
      category,
      source: { family, variant: normalizeVariant(variant) },
      file: `${id}${FACE_EXTENSION}`,
      bytes: bytes.byteLength,
      ...optionalTabular(hasTabularDigits(bytes))
    }, bytes)
  }

  async remove(id: string): Promise<FontLibraryResult<void>> {
    await this.load()
    if (BUNDLED_FACES.some((face) => face.id === id)) {
      return failure('read_only', 'A bundled font cannot be removed.')
    }
    const index = this.index.entries.findIndex((entry) => entry.id === id)
    if (index < 0) return failure('not_found', `The library holds no font called "${id}".`)
    const [removed] = this.index.entries.splice(index, 1)
    try {
      if (removed) await rm(join(this.facesDirectory, removed.file), { force: true })
      await this.writeIndex()
    } catch (error) {
      return failure('write_failed', messageOf(error, 'The library could not be updated.'))
    }
    return { ok: true, value: undefined }
  }

  private async bundledFaceSizes(): Promise<Map<string, number>> {
    if (this.bundledSizes) return this.bundledSizes
    const sizes = new Map<string, number>()
    for (const face of BUNDLED_FACES) {
      try {
        sizes.set(face.id, (await stat(face.path)).size)
      } catch {
        // A bundled face that cannot be measured is still usable; only the
        // budget readout is short by its size until the next start.
      }
    }
    this.bundledSizes = sizes
    return sizes
  }

  private has(id: string): boolean {
    return (
      BUNDLED_FACES.some((face) => face.id === id) ||
      this.index.entries.some((entry) => entry.id === id)
    )
  }

  private async entry(id: string): Promise<FontLibraryEntry | undefined> {
    const snapshot = await this.list()
    return snapshot.entries.find((entry) => entry.id === id)
  }

  private async store(
    stored: StoredEntry,
    bytes: Uint8Array
  ): Promise<FontLibraryResult<FontLibraryEntry>> {
    try {
      await mkdir(this.facesDirectory, { recursive: true })
      await writeFile(join(this.facesDirectory, stored.file), bytes)
      this.index.entries.push(stored)
      this.index.entries.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      await this.writeIndex()
    } catch (error) {
      return failure('write_failed', messageOf(error, 'The font could not be added to the library.'))
    }
    return {
      ok: true,
      value: {
        id: stored.id,
        name: stored.name,
        origin: stored.origin,
        category: stored.category,
        source: stored.source,
        bytes: stored.bytes,
        ...optionalTabular(stored.tabularDigits)
      }
    }
  }

  private async writeIndex(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await writeFile(this.indexPath, `${JSON.stringify(this.index, undefined, 2)}\n`, 'utf8')
  }

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      this.index = parseIndex(JSON.parse(await readFile(this.indexPath, 'utf8')))
    } catch {
      // No index yet is an empty library. A corrupt one degrades to the bundled
      // faces plus a count, so one bad file cannot cost the author the picker.
      this.index = {
        format: FONT_LIBRARY_FORMAT,
        format_version: FONT_LIBRARY_FORMAT_VERSION,
        entries: []
      }
    }
    await this.dropMissingFaces()
    await this.adoptLegacyCache()
    await this.backfillTabularDigits()
  }

  /**
   * Entries written before the digit width was recorded have no answer stored,
   * and would show no badge next to a font that has one — which reads as the
   * check being unreliable rather than as the record being old. Read once and
   * written back, so this happens on the first start after the upgrade and
   * never again.
   */
  private async backfillTabularDigits(): Promise<void> {
    let changed = false
    for (const entry of this.index.entries) {
      if (entry.tabularDigits !== undefined) continue
      const bytes = await readFaceFile(join(this.facesDirectory, entry.file))
      const tabular = bytes ? hasTabularDigits(bytes) : undefined
      if (tabular === undefined) continue
      entry.tabularDigits = tabular
      changed = true
    }
    if (changed) await this.writeIndex().catch(() => undefined)
  }

  /** An entry whose file is gone is a gap in the list, not a broken library. */
  private async dropMissingFaces(): Promise<void> {
    const kept: StoredEntry[] = []
    for (const entry of this.index.entries) {
      try {
        await stat(join(this.facesDirectory, entry.file))
        kept.push(entry)
      } catch {
        this.unreadable += 1
      }
    }
    this.index.entries = kept
  }

  /**
   * Faces that earlier versions cached to draw a preview with become imported
   * entries, once. Before the library existed, uploading was the only way to
   * make the canvas draw in the real face, so this is what keeps an existing
   * project rendering the way it did yesterday. The old directory is left
   * alone: it is a cache, and deleting it is not worth a failure path.
   */
  private async adoptLegacyCache(): Promise<void> {
    if (!this.legacyFontCacheDirectory) return
    let files: string[]
    try {
      files = await readdir(this.legacyFontCacheDirectory)
    } catch {
      return
    }
    for (const file of files) {
      if (!file.endsWith('.font')) continue
      const id = file.slice(0, -'.font'.length)
      if (!FONT_FAMILY_PATTERN.test(id) || this.has(id)) continue
      try {
        const bytes = new Uint8Array(await readFile(join(this.legacyFontCacheDirectory, file)))
        if (faceProblem(bytes)) continue
        await this.store({
          id,
          name: id,
          origin: 'imported',
          file: `${id}${FACE_EXTENSION}`,
          bytes: bytes.byteLength,
          ...optionalTabular(hasTabularDigits(bytes))
        }, bytes)
      } catch {
        // A face that cannot be adopted simply is not adopted.
      }
    }
  }
}

async function readFaceFile(path: string): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await readFile(path))
  } catch {
    return undefined
  }
}

function faceProblem(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength < MINIMUM_FACE_SIZE) return 'That file is too small to be a font face.'
  if (bytes.byteLength > MAXIMUM_FACE_SIZE) {
    return 'That face is larger than the whole 2 MiB font partition.'
  }
  const signature = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false)
  return SFNT_SIGNATURES.some((candidate) => candidate === signature)
    ? undefined
    : 'That file is not a TTF or OTF font face.'
}

function displayName(family: string, variant: FontVariant): string {
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

function parseIndex(value: unknown): StoredIndex {
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
function optionalTabular(tabular: boolean | undefined): { tabularDigits?: boolean } {
  return tabular === undefined ? {} : { tabularDigits: tabular }
}

function failure<T>(code: FontLibraryError['code'], message: string): FontLibraryResult<T> {
  return { ok: false, error: { code, message } }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
