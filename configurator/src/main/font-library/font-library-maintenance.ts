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

// The once-per-start maintenance the library performs while loading its index:
// dropping records whose files are gone, recording digit widths older records
// never stored, and adopting the pre-library font cache. Split from the
// service so loading reads as three named passes rather than one long method.

/** An entry whose file is gone is a gap in the list, not a broken library. Returns how many. */
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

/**
 * Entries written before the digit width was recorded have no answer stored,
 * and would show no badge next to a font that has one — which reads as the
 * check being unreliable rather than as the record being old. Read once and
 * written back, so this happens on the first start after the upgrade and
 * never again. Returns whether the index changed and needs writing.
 */
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

/**
 * Faces that earlier versions cached to draw a preview with become imported
 * entries, once. Before the library existed, uploading was the only way to
 * make the canvas draw in the real face, so this is what keeps an existing
 * project rendering the way it did yesterday. The old directory is left
 * alone: it is a cache, and deleting it is not worth a failure path.
 */
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
      // A face that cannot be adopted simply is not adopted.
    }
  }
}
