import { mkdir, readFile, readdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import { FONT_LIBRARY_FORMAT, FONT_LIBRARY_FORMAT_VERSION } from '../../shared/font-library'
import {
  FACE_EXTENSION,
  faceProblem,
  optionalTabular,
  parseIndex,
  readFaceFile,
  type StoredIndex
} from './font-library-files'
import { hasTabularDigits } from './font-metrics'
import { writeFileAtomic } from '../write-file-atomic'

const DAMAGED_INDEX_EXTENSION = '.bak'

export interface LoadedIndex {
  index: StoredIndex
  changed: boolean
}

export function emptyIndex(): StoredIndex {
  return {
    format: FONT_LIBRARY_FORMAT,
    format_version: FONT_LIBRARY_FORMAT_VERSION,
    entries: []
  }
}

export function sortEntries(index: StoredIndex): void {
  index.entries.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

export async function loadStoredIndex(
  indexPath: string,
  facesDirectory: string
): Promise<LoadedIndex> {
  const index = await readIndex(indexPath)
  const changed = await adoptUnlistedFaces(index, facesDirectory)
  sortEntries(index)
  return { index, changed }
}

export async function writeStoredIndex(
  indexPath: string,
  index: StoredIndex,
  facesDirectory: string
): Promise<void> {
  if (index.entries.length === 0 && (await holdsFaces(facesDirectory))) {
    throw new Error()
  }
  await mkdir(dirname(indexPath), { recursive: true })
  await writeFileAtomic(indexPath, `${JSON.stringify(index, undefined, 2)}\n`)
}

async function readIndex(indexPath: string): Promise<StoredIndex> {
  let raw: string
  try {
    raw = await readFile(indexPath, 'utf8')
  } catch (error) {
    if (!isMissing(error)) await keepDamagedIndex(indexPath)
    return emptyIndex()
  }
  try {
    return parseIndex(JSON.parse(raw))
  } catch {
    await keepDamagedIndex(indexPath)
    return emptyIndex()
  }
}

async function keepDamagedIndex(indexPath: string): Promise<void> {
  await rename(indexPath, `${indexPath}${DAMAGED_INDEX_EXTENSION}`).catch(() => undefined)
}

async function adoptUnlistedFaces(index: StoredIndex, facesDirectory: string): Promise<boolean> {
  let files: string[]
  try {
    files = await readdir(facesDirectory)
  } catch {
    return false
  }
  const listed = new Set(index.entries.map((entry) => entry.file))
  let adopted = false
  for (const file of files) {
    if (!file.endsWith(FACE_EXTENSION) || listed.has(file)) continue
    const id = file.slice(0, -FACE_EXTENSION.length)
    if (!FONT_FAMILY_PATTERN.test(id)) continue
    const bytes = await readFaceFile(join(facesDirectory, file))
    if (!bytes || faceProblem(bytes)) continue
    index.entries.push({
      id,
      name: id,
      origin: 'imported',
      file,
      bytes: bytes.byteLength,
      ...optionalTabular(hasTabularDigits(bytes))
    })
    adopted = true
  }
  return adopted
}

async function holdsFaces(facesDirectory: string): Promise<boolean> {
  try {
    return (await readdir(facesDirectory)).some((file) => file.endsWith(FACE_EXTENSION))
  } catch {
    return false
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}
