import type { BrowserWindow } from 'electron'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import {
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
import { BundledFaceFacts } from './font-library-bundled'
import {
  adoptLegacyCache,
  backfillTabularDigits,
  dropMissingFaces
} from './font-library-maintenance'
import {
  FACE_EXTENSION,
  faceProblem,
  faceSizeProblem,
  displayName,
  failure,
  messageOf,
  optionalTabular,
  readFaceFile,
  type StoredEntry,
  type StoredIndex
} from './font-library-files'
import {
  emptyIndex,
  loadStoredIndex,
  sortEntries,
  writeStoredIndex
} from './font-library-index'
import { hasTabularDigits, missingCharacters } from './font-metrics'
import { t } from '@shared/ui-text'

const INDEX_FILE = 'library.json'
const FACES_DIRECTORY = 'faces'
const MAXIMUM_USER_FACES = 256

export class FontLibraryService {
  private readonly facesDirectory: string
  private readonly indexPath: string
  private index: StoredIndex = emptyIndex()
  private unreadable = 0
  private loading: Promise<void> | undefined
  private readonly bundled = new BundledFaceFacts((id) => this.readFace(id))

  constructor(
    directory: string,
    private readonly legacyFontCacheDirectory?: string
  ) {
    this.facesDirectory = join(directory, FACES_DIRECTORY)
    this.indexPath = join(directory, INDEX_FILE)
  }

  async list(): Promise<FontLibrarySnapshot> {
    await this.load()
    const sizes = await this.bundled.fileSizes()
    const entries: FontLibraryEntry[] = []
    for (const face of BUNDLED_FACES) {
      entries.push({
        id: face.id,
        name: face.name,
        origin: 'bundled',
        category: face.category,
        source: { family: face.family, variant: face.variant },
        bytes: sizes.get(face.id) ?? 0,
        ...optionalTabular(await this.bundled.tabularDigitsOf(face.id))
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

  async readFace(id: string): Promise<Uint8Array | undefined> {
    await this.load()
    const bundled = BUNDLED_FACES.find((face) => face.id === id)
    if (bundled) return readFaceFile(bundled.path)
    const stored = this.index.entries.find((entry) => entry.id === id)
    if (!stored) return undefined
    return readFaceFile(join(this.facesDirectory, stored.file))
  }

  async covers(id: string, characters: string): Promise<boolean | undefined> {
    const bytes = await this.readFace(id)
    if (!bytes) return undefined
    const missing = missingCharacters(bytes, characters)
    return missing === undefined ? undefined : missing.length === 0
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
      return failure('invalid_request', t('fonts.fontLibraryService.idIsNotAValid', { id: id }))
    }
    if (id !== undefined && this.has(id)) {
      return failure('id_taken', t('fonts.fontLibraryService.theLibraryAlreadyHoldsA', { id: id }))
    }
    if (this.index.entries.length >= MAXIMUM_USER_FACES) {
      return failure('limit_reached', t('fonts.fontLibraryService.theLibraryHoldsAtMost', { mAXIMUM_USER_FACES: MAXIMUM_USER_FACES }))
    }

    const outcome = await chooseFile(FONT_FILE_CHOICE, owner)
    if (outcome.kind === 'cancelled') return { ok: true, value: null }
    if (outcome.kind === 'wrong_extension') {
      return failure('not_a_font', t('fonts.fontLibraryService.selectATtfOrOtf'))
    }

    let bytes: Uint8Array
    try {
      const oversize = faceSizeProblem((await stat(outcome.file.path)).size)
      if (oversize) return failure('not_a_font', oversize)
      bytes = new Uint8Array(await readFile(outcome.file.path))
    } catch (error) {
      return failure('read_failed', messageOf(error, t('fonts.fontLibraryService.theFontFileCouldNot')))
    }
    const invalid = faceProblem(bytes)
    if (invalid) return failure('not_a_font', invalid)

    const name = outcome.file.name.replace(/\.[^.]+$/, '')
    const resolved = id ?? fontFamilyId(name)
    if (!resolved) {
      return failure('invalid_request', t('fonts.fontLibraryService.nameDoesNotReduceTo', { name: name }))
    }
    if (this.has(resolved)) {
      return failure('id_taken', t('fonts.fontLibraryService.theLibraryAlreadyHoldsA2', { resolved: resolved }))
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
      return failure('invalid_request', t('fonts.fontLibraryService.familyDoesNotReduceTo', { family: family }))
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
      return failure('read_only', t('fonts.fontLibraryService.aBundledFontCannotBe'))
    }
    const index = this.index.entries.findIndex((entry) => entry.id === id)
    if (index < 0) return failure('not_found', t('fonts.fontLibraryService.theLibraryHoldsNoFont', { id: id }))
    const [removed] = this.index.entries.splice(index, 1)
    try {
      if (removed) await rm(join(this.facesDirectory, removed.file), { force: true })
      await this.writeIndex()
    } catch (error) {
      return failure('write_failed', messageOf(error, t('fonts.fontLibraryService.theLibraryCouldNotBe')))
    }
    return { ok: true, value: undefined }
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
      sortEntries(this.index)
      await this.writeIndex()
    } catch (error) {
      return failure('write_failed', messageOf(error, t('fonts.fontLibraryService.theFontCouldNotBe')))
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
    await writeStoredIndex(this.indexPath, this.index, this.facesDirectory)
  }

  private async load(): Promise<void> {
    this.loading ??= this.loadOnce()
    await this.loading
  }

  private async loadOnce(): Promise<void> {
    const loaded = await loadStoredIndex(this.indexPath, this.facesDirectory)
    this.index = loaded.index
    this.unreadable += await dropMissingFaces(this.index, this.facesDirectory)
    await adoptLegacyCache(
      this.legacyFontCacheDirectory,
      (id) => this.has(id),
      (entry, bytes) => this.store(entry, bytes)
    )
    const backfilled = await backfillTabularDigits(this.index, this.facesDirectory)
    if (loaded.changed || backfilled) {
      await this.writeIndex().catch(() => undefined)
    }
  }

}
