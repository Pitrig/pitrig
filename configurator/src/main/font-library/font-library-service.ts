import type { BrowserWindow } from 'electron'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import {
  FONT_LIBRARY_FORMAT,
  FONT_LIBRARY_FORMAT_VERSION,
  fontFamilyId,
  normalizeVariant,
  type FontFaceBytes,
  type FontLibraryEntry,
  type FontLibraryResult,
  type FontLibrarySnapshot,
  type FontVariant
} from '../../shared/font-library'
import { FONT_FILE_CHOICE, chooseFile } from '../assets/choose-file'
import { BUNDLED_FACES } from './bundled-faces'
import {
  adoptLegacyCache,
  backfillTabularDigits,
  dropMissingFaces
} from './font-library-maintenance'
import {
  FACE_EXTENSION,
  faceProblem,
  displayName,
  failure,
  messageOf,
  optionalTabular,
  parseIndex,
  readFaceFile,
  type StoredEntry,
  type StoredIndex
} from './font-library-files'
import { hasTabularDigits } from './font-metrics'

const INDEX_FILE = 'library.json'
const FACES_DIRECTORY = 'faces'
const MAXIMUM_USER_FACES = 256

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
  private bundledSizes: Map<string, number> | undefined
  private readonly bundledTabular = new Map<string, boolean | null>()

  constructor(
    private readonly directory: string,
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

  private async tabularDigitsOf(id: string): Promise<boolean | undefined> {
    const known = this.bundledTabular.get(id)
    if (known !== undefined) return known ?? undefined
    const bytes = await this.readFace(id)
    const tabular = bytes ? hasTabularDigits(bytes) : undefined
    this.bundledTabular.set(id, tabular ?? null)
    return tabular
  }

  async readFace(id: string): Promise<Uint8Array | undefined> {
    await this.load()
    const bundled = BUNDLED_FACES.find((face) => face.id === id)
    if (bundled) return readFaceFile(bundled.path)
    const stored = this.index.entries.find((entry) => entry.id === id)
    if (!stored) return undefined
    return readFaceFile(join(this.facesDirectory, stored.file))
  }

  async readFaces(ids: readonly string[]): Promise<FontFaceBytes[]> {
    const faces: FontFaceBytes[] = []
    for (const id of new Set(ids)) {
      const bytes = await this.readFace(id)
      if (bytes) faces.push({ id, bytes })
    }
    return faces
  }

  async unresolved(ids: readonly string[]): Promise<string[]> {
    await this.load()
    const known = new Set<string>([
      ...BUNDLED_FACES.map((face) => face.id),
      ...this.index.entries.map((entry) => entry.id)
    ])
    return [...new Set(ids)].filter((id) => !known.has(id)).sort()
  }

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
      this.index = {
        format: FONT_LIBRARY_FORMAT,
        format_version: FONT_LIBRARY_FORMAT_VERSION,
        entries: []
      }
    }
    this.unreadable += await dropMissingFaces(this.index, this.facesDirectory)
    await adoptLegacyCache(
      this.legacyFontCacheDirectory,
      (id) => this.has(id),
      (entry, bytes) => this.store(entry, bytes)
    )
    if (await backfillTabularDigits(this.index, this.facesDirectory)) {
      await this.writeIndex().catch(() => undefined)
    }
  }

}
