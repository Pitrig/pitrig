import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { IMAGE_ID_PATTERN } from '../../shared/image-assets'
import { crc32 } from '../device/asset-crc'
import type { ConvertedImage, PackageImage } from '../image-assets/image-package'
import { encodePlanesAsPng } from '../image-assets/image-pixels'
import { writeFileAtomic } from '../write-file-atomic'
import { parseStoredImage, serializeStoredImage, type StoredImage } from './image-library-index'
import { t } from '@shared/ui-text'

type Extension = '.bin' | '.png' | '.json'

export class ImageLibraryFiles {
  constructor(private readonly directory: string) {}

  async readEntries(): Promise<{ entries: StoredImage[]; unreadable: number }> {
    let files: string[]
    try {
      files = await readdir(this.directory)
    } catch {
      return { entries: [], unreadable: 0 }
    }
    const entries: StoredImage[] = []
    let unreadable = 0
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const id = file.slice(0, -'.json'.length)
      try {
        const parsed = parseStoredImage(
          JSON.parse(await readFile(join(this.directory, file), 'utf8')),
          id
        )
        const blob = parsed ? await stat(this.pathFor(id, '.bin')) : undefined
        if (parsed && blob?.isFile() && blob.size === parsed.storedBytes) entries.push(parsed)
        else unreadable += 1
      } catch {
        unreadable += 1
      }
    }
    return { entries, unreadable }
  }

  async write(image: PackageImage, planes: ConvertedImage): Promise<StoredImage> {
    await mkdir(this.directory, { recursive: true })
    const stored: StoredImage = {
      id: image.name,
      width: image.width,
      height: image.height,
      frameCount: image.frameCount,
      format: image.format,
      storedBytes: image.data.byteLength,
      compression: image.compression,
      blobCrc: crc32(image.data),
      sha256: image.sha256,
      updatedAt: Date.now()
    }
    await writeFileAtomic(this.pathFor(stored.id, '.bin'), image.data)
    const png = encodePlanesAsPng(planes)
    if (png) await writeFileAtomic(this.pathFor(stored.id, '.png'), png)
    else await rm(this.pathFor(stored.id, '.png'), { force: true })
    await writeFileAtomic(this.pathFor(stored.id, '.json'), serializeStoredImage(stored))
    return stored
  }

  async delete(id: string): Promise<void> {
    await rm(this.pathFor(id, '.json'), { force: true })
    await rm(this.pathFor(id, '.bin'), { force: true }).catch(() => undefined)
    await rm(this.pathFor(id, '.png'), { force: true }).catch(() => undefined)
  }

  async readBlob(entry: StoredImage): Promise<Buffer> {
    const data = await readFile(this.pathFor(entry.id, '.bin'))
    if (data.byteLength !== entry.storedBytes || crc32(data) !== entry.blobCrc) {
      throw new Error(t('images.imageLibrary.damaged', { id: entry.id }))
    }
    return data
  }

  async readPreview(
    entry: StoredImage,
    planes: () => Promise<ConvertedImage | undefined>
  ): Promise<Buffer | undefined> {
    try {
      return await readFile(this.pathFor(entry.id, '.png'))
    } catch {
      const decoded = await planes()
      const png = decoded ? encodePlanesAsPng(decoded) : undefined
      if (png) await writeFileAtomic(this.pathFor(entry.id, '.png'), png).catch(() => undefined)
      return png
    }
  }

  private pathFor(id: string, extension: Extension): string {
    const fileName = `${id}${extension}`
    const path = join(this.directory, fileName)
    if (!IMAGE_ID_PATTERN.test(id) || basename(path) !== fileName) {
      throw new Error(t('images.imagePackage.nameIsNotAValid', { name: id }))
    }
    return path
  }
}
