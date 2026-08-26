import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import type { FontLibraryResult, FontLibraryEntry } from '../../shared/font-library'
import { hasTabularDigits } from './font-metrics'
import {
  FACE_EXTENSION,
  faceProblem,
  optionalTabular,
  readFaceFile,
  type StoredEntry,
  type StoredIndex
} from './font-library-files'

export async function dropMissingFaces(
  index: StoredIndex,
  facesDirectory: string
): Promise<number> {
  const kept: StoredEntry[] = []
  let missing = 0
  for (const entry of index.entries) {
    try {
      await stat(join(facesDirectory, entry.file))
      kept.push(entry)
    } catch {
      missing += 1
    }
  }
  index.entries = kept
  return missing
}

export async function backfillTabularDigits(
  index: StoredIndex,
  facesDirectory: string
): Promise<boolean> {
  let changed = false
  for (const entry of index.entries) {
    if (entry.tabularDigits !== undefined) continue
    const bytes = await readFaceFile(join(facesDirectory, entry.file))
    const tabular = bytes ? hasTabularDigits(bytes) : undefined
    if (tabular === undefined) continue
    entry.tabularDigits = tabular
    changed = true
  }
  return changed
}

export async function adoptLegacyCache(
  legacyDirectory: string | undefined,
  has: (id: string) => boolean,
  store: (entry: StoredEntry, bytes: Uint8Array) => Promise<FontLibraryResult<FontLibraryEntry>>
): Promise<void> {
  if (!legacyDirectory) return
  let files: string[]
  try {
    files = await readdir(legacyDirectory)
  } catch {
    return
  }
  for (const file of files) {
    if (!file.endsWith('.font')) continue
    const id = file.slice(0, -'.font'.length)
    if (!FONT_FAMILY_PATTERN.test(id) || has(id)) continue
    try {
      const bytes = new Uint8Array(await readFile(join(legacyDirectory, file)))
      if (faceProblem(bytes)) continue
      await store({
        id,
        name: id,
        origin: 'imported',
        file: `${id}${FACE_EXTENSION}`,
        bytes: bytes.byteLength,
        ...optionalTabular(hasTabularDigits(bytes))
      }, bytes)
    } catch {
    }
  }
}
