import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import {
  IMAGE_COLOR_FORMATS,
  IMAGE_ID_PATTERN,
  MAXIMUM_SPRITE_FRAMES,
  type ImageColorFormat
} from '../../shared/image-assets'

const MANIFEST_FILE = 'formats.json'
const PNG_EXTENSION = '.png'

export interface LegacyImage {
  name: string
  format?: ImageColorFormat
  frameCount: number
  png: Buffer
}

export class LegacyImageCache {
  private readonly imageDirectory: string

  constructor(previewDirectory: string) {
    this.imageDirectory = join(previewDirectory, 'images')
  }

  async read(): Promise<LegacyImage[]> {
    const formats = await this.readFormats()
    const images: LegacyImage[] = []
    for (const file of await listDirectory(this.imageDirectory)) {
      if (!file.endsWith(PNG_EXTENSION)) continue
      const name = file.slice(0, -PNG_EXTENSION.length)
      if (!IMAGE_ID_PATTERN.test(name)) continue
      try {
        images.push({
          name,
          frameCount: 1,
          ...formats.get(name),
          png: await readFile(join(this.imageDirectory, file))
        })
      } catch {
        continue
      }
    }
    return images
  }

  async discard(names: readonly string[]): Promise<void> {
    for (const name of names) {
      if (IMAGE_ID_PATTERN.test(name)) {
        await rm(join(this.imageDirectory, `${name}${PNG_EXTENSION}`), { force: true })
      }
    }
    const left = (await listDirectory(this.imageDirectory)).some((file) => file.endsWith(PNG_EXTENSION))
    if (!left) await rm(this.imageDirectory, { recursive: true, force: true })
  }

  private async readFormats(): Promise<Map<string, Omit<LegacyImage, 'name' | 'png'>>> {
    const formats = new Map<string, Omit<LegacyImage, 'name' | 'png'>>()
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(this.imageDirectory, MANIFEST_FILE), 'utf8')
      )
      if (!parsed || typeof parsed !== 'object') return formats
      for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue
        const { format, frameCount } = value as { format?: unknown; frameCount?: unknown }
        if (!IMAGE_COLOR_FORMATS.includes(format as ImageColorFormat)) continue
        const frames =
          Number.isSafeInteger(frameCount) &&
          (frameCount as number) >= 1 &&
          (frameCount as number) <= MAXIMUM_SPRITE_FRAMES
            ? (frameCount as number)
            : 1
        formats.set(name, { format: format as ImageColorFormat, frameCount: frames })
      }
    } catch {
      return formats
    }
    return formats
  }
}

async function listDirectory(directory: string): Promise<string[]> {
  try {
    return await readdir(directory)
  } catch {
    return []
  }
}
