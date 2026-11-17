import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { inflateRaw } from 'node:zlib'

import { imageAssetBytes } from '../../shared/image-assets'
import {
  MAXIMUM_INSTALLED_RECORDS,
  type ImageLibraryEntry,
  type ImageLibrarySnapshot,
  type InstalledPackageRecord
} from '../../shared/image-library'
import type { PreviewImageAsset } from '../../shared/preview-assets'
import {
  COMPRESSION_DEFLATE,
  imageStride,
  packageImage,
  planesDigest,
  type ConvertedImage,
  type PackageImage
} from '../image-assets/image-package'
import { legacyFormat, planesFromPng } from '../image-assets/image-pixels'
import { writeFileAtomic } from '../write-file-atomic'
import { ImageLibraryFiles } from './image-library-files'
import {
  emptyState,
  libraryProblem,
  parseLibraryState,
  publicEntry,
  serializeLibraryState,
  type LibraryState,
  type StoredImage
} from './image-library-index'
import type { LegacyImageCache } from './legacy-image-cache'
import { t } from '@shared/ui-text'

const STATE_FILE = 'library.json'
const IMAGES_DIRECTORY = 'images'
const inflateRawAsync = promisify(inflateRaw)

export class ImageLibraryService {
  private readonly files: ImageLibraryFiles
  private readonly directory: string
  private readonly statePath: string
  private readonly entries = new Map<string, StoredImage>()
  private state: LibraryState = emptyState()
  private unreadable = 0
  private loading: Promise<void> | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    directory: string,
    private readonly legacy: LegacyImageCache | undefined,
    private readonly onChanged: (snapshot: ImageLibrarySnapshot) => void = () => undefined
  ) {
    this.directory = directory
    this.files = new ImageLibraryFiles(join(directory, IMAGES_DIRECTORY))
    this.statePath = join(directory, STATE_FILE)
  }

  async snapshot(): Promise<ImageLibrarySnapshot> {
    await this.load()
    return this.currentSnapshot()
  }

  async entry(id: string): Promise<ImageLibraryEntry | undefined> {
    await this.load()
    const stored = this.entries.get(id)
    return stored ? publicEntry(stored) : undefined
  }

  async previews(): Promise<PreviewImageAsset[]> {
    await this.load()
    const previews: PreviewImageAsset[] = []
    for (const entry of this.sortedEntries()) {
      const png = await this.files.readPreview(entry, () => this.readPlanes(entry.id))
      if (!png) continue
      previews.push({
        name: entry.id,
        width: entry.width,
        height: entry.height,
        frameCount: entry.frameCount,
        format: entry.format,
        dataUrl: `data:image/png;base64,${png.toString('base64')}`
      })
    }
    return previews
  }

  async add(images: readonly ConvertedImage[]): Promise<ImageLibraryEntry[]> {
    const packaged = await Promise.all(images.map((image) => packageImage(image)))
    for (const image of packaged) {
      const problem = libraryProblem(image)
      if (problem) throw new Error(problem)
    }
    return this.exclusive(async () => {
      const added: ImageLibraryEntry[] = []
      for (const [index, image] of packaged.entries()) {
        const stored = await this.files.write(image, images[index]!)
        this.entries.set(stored.id, stored)
        added.push(publicEntry(stored))
      }
      this.changed()
      return added
    })
  }

  async remove(id: string): Promise<boolean> {
    return this.exclusive(async () => {
      if (!this.entries.has(id)) return false
      await this.files.delete(id)
      this.entries.delete(id)
      this.changed()
      return true
    })
  }

  async packageImages(ids: readonly string[]): Promise<PackageImage[]> {
    await this.load()
    const images: PackageImage[] = []
    for (const id of ids) {
      const entry = this.entries.get(id)
      if (!entry) throw new Error(t('images.imageLibrary.notOnThisPc', { id }))
      images.push({
        name: id,
        format: entry.format,
        width: entry.width,
        height: entry.height,
        stride: imageStride(entry.width, entry.format),
        frameCount: entry.frameCount,
        compression: entry.compression,
        data: await this.files.readBlob(entry),
        sha256: entry.sha256
      })
    }
    return images
  }

  async readPlanes(id: string): Promise<ConvertedImage | undefined> {
    await this.load()
    const entry = this.entries.get(id)
    if (!entry) return undefined
    try {
      const data = await this.files.readBlob(entry)
      const raw = imageAssetBytes(entry.width, entry.height, entry.format) * entry.frameCount
      const bytes =
        entry.compression === COMPRESSION_DEFLATE
          ? await inflateRawAsync(data, { maxOutputLength: raw })
          : data
      if (bytes.byteLength !== raw || planesDigest(bytes) !== entry.sha256) return undefined
      return {
        name: id,
        format: entry.format,
        width: entry.width,
        height: entry.height,
        stride: imageStride(entry.width, entry.format),
        frameCount: entry.frameCount,
        bytes
      }
    } catch {
      return undefined
    }
  }

  async recordInstalled(images: readonly PackageImage[], size: number): Promise<void> {
    await this.exclusive(async () => {
      const record: InstalledPackageRecord = {
        size,
        installedAt: Date.now(),
        images: [...images]
          .sort((left, right) => (left.name < right.name ? -1 : 1))
          .map((image) => ({
            id: image.name,
            width: image.width,
            height: image.height,
            format: image.format,
            frameCount: image.frameCount,
            sha256: image.sha256
          }))
      }
      const signature = geometryOf(record)
      const kept = this.state.installed.filter(
        (entry) => entry.size !== size || geometryOf(entry) !== signature
      )
      this.state = {
        ...this.state,
        installed: [record, ...kept].slice(0, MAXIMUM_INSTALLED_RECORDS)
      }
      await this.writeState()
      this.changed()
    })
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      await this.load()
      return work()
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  private async load(): Promise<void> {
    this.loading ??= this.loadOnce()
    await this.loading
  }

  private async loadOnce(): Promise<void> {
    try {
      this.state = parseLibraryState(JSON.parse(await readFile(this.statePath, 'utf8')))
    } catch {
      this.state = emptyState()
    }
    const loaded = await this.files.readEntries()
    for (const entry of loaded.entries) this.entries.set(entry.id, entry)
    this.unreadable = loaded.unreadable
    if (!this.state.legacySeeded) await this.seedFromLegacy()
  }

  private async seedFromLegacy(): Promise<void> {
    if (!this.legacy) return
    try {
      const moved: string[] = []
      for (const image of await this.legacy.read()) {
        if (this.entries.has(image.name)) continue
        const format = image.format ?? legacyFormat(image.png)
        const planes = format ? planesFromPng(image.png, format, image.frameCount) : undefined
        if (!planes) continue
        const converted: ConvertedImage = {
          name: image.name,
          ...planes,
          stride: imageStride(planes.width, planes.format)
        }
        const packaged = await packageImage(converted)
        if (libraryProblem(packaged)) continue
        const stored = await this.files.write(packaged, converted)
        this.entries.set(stored.id, stored)
        moved.push(image.name)
      }
      this.state = { ...this.state, legacySeeded: true }
      await this.writeState()
      await this.legacy.discard(moved).catch(() => undefined)
    } catch {
      return
    }
  }

  private async writeState(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await writeFileAtomic(this.statePath, serializeLibraryState(this.state))
  }

  private sortedEntries(): StoredImage[] {
    return [...this.entries.values()].sort((left, right) => (left.id < right.id ? -1 : 1))
  }

  private currentSnapshot(): ImageLibrarySnapshot {
    return {
      entries: this.sortedEntries().map(publicEntry),
      installed: this.state.installed,
      unreadable: this.unreadable
    }
  }

  private changed(): void {
    this.onChanged(this.currentSnapshot())
  }
}

function geometryOf(record: InstalledPackageRecord): string {
  return JSON.stringify(
    record.images.map((image) => [image.id, image.width, image.height, image.format, image.frameCount])
  )
}
