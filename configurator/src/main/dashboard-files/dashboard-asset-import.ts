import { freeAssetId } from '../../shared/document-assets'
import type { DashboardOpenReport } from '../../shared/dashboard-files'
import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import {
  fontFamilyId,
  normalizeVariant,
  type FontLibraryEntry
} from '../../shared/font-library'
import { IMAGE_ID_PATTERN } from '../../shared/image-assets'
import type { FontCatalogService } from '../font-library/font-catalog-service'
import { displayName } from '../font-library/font-library-files'
import type { FontLibraryService } from '../font-library/font-library-service'
import { imageStride, planesDigest, type ConvertedImage } from '../image-assets/image-package'
import type { ImageLibraryService } from '../image-library/image-library-service'
import { digest } from './dashboard-file-container'
import type { FileFont, FileImage } from './dashboard-file-format'

export interface AssetLibraries {
  images: ImageLibraryService
  fonts: FontLibraryService
  catalog: FontCatalogService
}

export async function importImages(
  ids: readonly string[],
  carried: readonly FileImage[],
  libraries: AssetLibraries,
  report: DashboardOpenReport
): Promise<Map<string, string>> {
  const renames = new Map<string, string>()
  const local = new Map((await libraries.images.snapshot()).entries.map((entry) => [entry.id, entry]))
  const byId = new Map(carried.map((image) => [image.id, image]))
  const reserved = new Set<string>()
  const named = new Set(ids)
  const taken = (id: string): boolean => local.has(id) || reserved.has(id) || named.has(id)
  const added: ConvertedImage[] = []
  for (const id of ids) {
    const image = byId.get(id)
    const existing = local.get(id)
    if (!image) {
      if (!existing) report.imagesMissing.push(id)
      continue
    }
    const sha256 = planesDigest(image.planes)
    if (existing?.sha256 === sha256) continue
    const twin = existing
      ? [...local.values()].find((entry) => entry.sha256 === sha256 && derivedFrom(entry.id, id))
      : undefined
    const target = twin?.id ?? (existing ? freeAssetId(id, taken, IMAGE_ID_PATTERN) : id)
    if (!target) {
      report.imagesMissing.push(id)
      continue
    }
    if (target !== id) renames.set(id, target)
    if (twin) continue
    reserved.add(target)
    added.push({
      name: target,
      format: image.format,
      width: image.width,
      height: image.height,
      stride: imageStride(image.width, image.format),
      frameCount: image.frameCount,
      bytes: image.planes
    })
  }
  for (const image of added) {
    try {
      await libraries.images.add([image])
      report.imagesAdded.push(image.name)
    } catch (error) {
      report.failures.push(error instanceof Error ? error.message : String(error))
      report.imagesMissing.push(originalOf(image.name, renames))
    }
  }
  return renames
}

export async function importFonts(
  ids: readonly string[],
  carried: readonly FileFont[],
  libraries: AssetLibraries,
  report: DashboardOpenReport
): Promise<Map<string, string>> {
  const renames = new Map<string, string>()
  const local = new Map<string, FontLibraryEntry>(
    (await libraries.fonts.list()).entries.map((entry) => [entry.id, entry])
  )
  const taken = new Set(local.keys())
  const named = new Set(ids)
  const pick = (id: string): string | undefined =>
    taken.has(id)
      ? freeAssetId(id, (key) => taken.has(key) || named.has(key), FONT_FAMILY_PATTERN)
      : id
  const byId = new Map(carried.map((font) => [font.id, font]))
  for (const id of ids) {
    const font = byId.get(id)
    const existing = local.get(id)
    if (existing && (!font || font.source === 'builtin' || sameSource(existing, font))) continue
    if (!font || (font.source === 'builtin' && !font.family)) {
      report.fontsMissing.push(id)
      continue
    }
    const stored =
      font.source === 'embedded'
        ? await adoptEmbedded(id, font, local, pick, libraries)
        : await adoptFromCatalog(id, font.family ?? '', font.variant ?? '', local, taken, pick, libraries)
    if (stored === undefined) {
      report.fontsMissing.push(id)
      continue
    }
    if (typeof stored === 'object') {
      report.failures.push(stored.failure)
      report.fontsMissing.push(id)
      continue
    }
    if (stored !== id) renames.set(id, stored)
    if (!taken.has(stored)) report.fontsAdded.push(stored)
    taken.add(stored)
  }
  return renames
}

type Adopted = string | { failure: string } | undefined

async function adoptEmbedded(
  id: string,
  font: Extract<FileFont, { source: 'embedded' }>,
  local: ReadonlyMap<string, FontLibraryEntry>,
  pick: (id: string) => string | undefined,
  libraries: AssetLibraries
): Promise<Adopted> {
  const wanted = digest(font.bytes)
  for (const candidate of local.keys()) {
    if (!derivedFrom(candidate, id)) continue
    const bytes = await libraries.fonts.readFace(candidate)
    if (bytes && digest(bytes) === wanted) return candidate
  }
  const target = pick(id)
  if (!target) return undefined
  const stored = await libraries.fonts.adopt({ id: target, name: font.name, origin: 'imported' }, font.bytes)
  return stored.ok ? target : { failure: stored.error.message }
}

async function adoptFromCatalog(
  id: string,
  family: string,
  variant: string,
  local: ReadonlyMap<string, FontLibraryEntry>,
  taken: ReadonlySet<string>,
  pick: (id: string) => string | undefined,
  libraries: AssetLibraries
): Promise<Adopted> {
  const twin = [...local.values()].find(
    (entry) => derivedFrom(entry.id, id) && sameSource(entry, { source: 'google', family, variant })
  )
  if (twin) return twin.id
  const face = await libraries.catalog.faceFor(family, variant).catch(() => undefined)
  if (!face) return undefined
  if (fontFamilyId(family, variant) === id && !taken.has(id)) {
    const added = await libraries.fonts.addDownloaded(family, variant, face.category, face.bytes)
    return added.ok ? added.value.id : { failure: added.error.message }
  }
  const target = pick(id)
  if (!target) return undefined
  const stored = await libraries.fonts.adopt(
    {
      id: target,
      name: displayName(family, variant),
      origin: 'google',
      category: face.category,
      source: { family, variant: normalizeVariant(variant) }
    },
    face.bytes
  )
  return stored.ok ? target : { failure: stored.error.message }
}

function sameSource(
  entry: FontLibraryEntry,
  font: { source: string; family?: string; variant?: string }
): boolean {
  if (font.source !== 'google' || !font.family || !font.variant || !entry.source) return false
  if (entry.origin !== 'google' && entry.origin !== 'bundled') return false
  return (
    entry.source.family === font.family &&
    normalizeVariant(entry.source.variant) === normalizeVariant(font.variant)
  )
}

function derivedFrom(candidate: string, base: string): boolean {
  if (candidate === base) return true
  const match = /^(.+)-\d+$/.exec(candidate)
  return match !== null && base.startsWith(match[1] ?? '')
}

function originalOf(target: string, renames: ReadonlyMap<string, string>): string {
  for (const [from, to] of renames) if (to === target) return from
  return target
}
