import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import catalogPath from './google-fonts-catalog.json?commonjs-external&asset'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import {
  fontFamilyId,
  normalizeVariant,
  type FontCatalogFamily,
  type FontCatalogPreview,
  type FontVariant
} from '../../shared/font-library'
import { faceProblem } from './font-library-files'
import { hasTabularDigits } from './font-metrics'
import { writeFileAtomic } from '../write-file-atomic'

const ASSET_HOST = 'https://fonts.gstatic.com/'
const DOWNLOAD_TIMEOUT_MS = 15_000
const MAXIMUM_CACHE_BYTES = 128 * 1024 * 1024

interface CatalogVariant {
  variant: FontVariant
  url: string
}

interface CatalogFamily {
  name: string
  category: string
  variants: CatalogVariant[]
}

export class FontCatalogService {
  private families: CatalogFamily[] | undefined
  private readonly inFlight = new Map<string, Promise<Uint8Array | undefined>>()

  constructor(private readonly cacheDirectory: string) {}

  async list(): Promise<FontCatalogFamily[]> {
    return (await this.load()).map((family) => ({
      name: family.name,
      category: family.category,
      variants: family.variants.map((variant) => variant.variant)
    }))
  }

  async preview(familyName: string): Promise<FontCatalogPreview | undefined> {
    const family = (await this.load()).find((entry) => entry.name === familyName)
    const shown =
      family?.variants.find((variant) => variant.variant === '400') ?? family?.variants[0]
    if (!family || !shown) return undefined
    const id = fontFamilyId(family.name, shown.variant)
    if (!id) return undefined
    const bytes = await this.face(id, shown.url)
    if (!bytes) return undefined
    const tabular = hasTabularDigits(bytes)
    return {
      family: family.name,
      id,
      bytes,
      ...(tabular === undefined ? {} : { tabularDigits: tabular })
    }
  }

  async faceFor(
    familyName: string,
    variant: FontVariant
  ): Promise<{ bytes: Uint8Array; category: string } | undefined> {
    const family = (await this.load()).find((entry) => entry.name === familyName)
    const wanted = normalizeVariant(variant)
    const match = family?.variants.find((entry) => entry.variant === wanted)
    if (!family || !match) return undefined
    const id = fontFamilyId(family.name, wanted)
    if (!id) return undefined
    const bytes = await this.face(id, match.url)
    return bytes ? { bytes, category: family.category } : undefined
  }

  private async face(id: string, url: string): Promise<Uint8Array | undefined> {
    const cached = await this.readCached(id)
    if (cached) return cached
    const existing = this.inFlight.get(id)
    if (existing) return existing
    const download = this.download(id, url).finally(() => this.inFlight.delete(id))
    this.inFlight.set(id, download)
    return download
  }

  private async download(id: string, url: string): Promise<Uint8Array | undefined> {
    if (!url.startsWith(ASSET_HOST)) return undefined
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
      const response = await fetch(url, { signal: abort.signal })
      if (!response.ok) return undefined
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (faceProblem(bytes)) return undefined
      await this.writeCached(id, bytes)
      return bytes
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }

  private async readCached(id: string): Promise<Uint8Array | undefined> {
    if (!FONT_FAMILY_PATTERN.test(id)) return undefined
    const path = join(this.cacheDirectory, `${id}.ttf`)
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(path))
    } catch {
      return undefined
    }
    if (!faceProblem(bytes)) return bytes
    await rm(path, { force: true }).catch(() => undefined)
    return undefined
  }

  private async writeCached(id: string, bytes: Uint8Array): Promise<void> {
    if (!FONT_FAMILY_PATTERN.test(id)) return
    try {
      await mkdir(this.cacheDirectory, { recursive: true })
      await writeFileAtomic(join(this.cacheDirectory, `${id}.ttf`), bytes)
      await this.prune()
    } catch {
    }
  }

  private async prune(): Promise<void> {
    try {
      const names = await readdir(this.cacheDirectory)
      const files = await Promise.all(
        names.map(async (name) => {
          const info = await stat(join(this.cacheDirectory, name))
          return { name, size: info.size, modified: info.mtimeMs }
        })
      )
      let total = files.reduce((sum, file) => sum + file.size, 0)
      if (total <= MAXIMUM_CACHE_BYTES) return
      for (const file of files.sort((left, right) => left.modified - right.modified)) {
        if (total <= MAXIMUM_CACHE_BYTES) return
        await rm(join(this.cacheDirectory, file.name), { force: true })
        total -= file.size
      }
    } catch {
    }
  }

  private async load(): Promise<CatalogFamily[]> {
    if (this.families) return this.families
    try {
      const parsed: unknown = JSON.parse(await readFile(catalogPath, 'utf8'))
      this.families = readCatalog(parsed)
    } catch {
      this.families = []
    }
    return this.families
  }
}

function readCatalog(value: unknown): CatalogFamily[] {
  if (typeof value !== 'object' || value === null) return []
  const families = (value as { families?: unknown }).families
  if (!Array.isArray(families)) return []
  const catalog: CatalogFamily[] = []
  for (const entry of families) {
    if (typeof entry !== 'object' || entry === null) continue
    const family = entry as { name?: unknown; category?: unknown; variants?: unknown }
    if (typeof family.name !== 'string' || !Array.isArray(family.variants)) continue
    const variants: CatalogVariant[] = []
    for (const variant of family.variants) {
      if (typeof variant !== 'object' || variant === null) continue
      const record = variant as { variant?: unknown; url?: unknown }
      if (
        typeof record.variant !== 'string' ||
        typeof record.url !== 'string' ||
        !record.url.startsWith(ASSET_HOST)
      ) {
        continue
      }
      variants.push({ variant: record.variant, url: record.url })
    }
    if (variants.length === 0) continue
    catalog.push({
      name: family.name,
      category: typeof family.category === 'string' ? family.category : 'Other',
      variants
    })
  }
  return catalog
}
