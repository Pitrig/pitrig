import { nativeImage } from 'electron'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  IMAGE_COLOR_FORMATS,
  IMAGE_ID_PATTERN,
  type ImageColorFormat
} from '../../shared/image-assets'
import {
  NO_PREVIEW_ASSETS,
  type PreviewAssets,
  type PreviewImageAsset
} from '../../shared/preview-assets'
import type { ConvertedImage } from '../image-assets/image-package'

const MANIFEST_FILE = 'formats.json'

interface StoredImage {
  format: ImageColorFormat
  frameCount: number
}

export class PreviewAssetCache {
  private readonly imageDirectory: string

  constructor(directory: string) {
    this.imageDirectory = join(directory, 'images')
  }

  async storeImages(images: readonly ConvertedImage[]): Promise<void> {
    await replaceDirectory(this.imageDirectory)
    const stored: Record<string, StoredImage> = {}
    for (const image of images) {
      if (!IMAGE_ID_PATTERN.test(image.name)) continue
      const png = encodePng(image)
      if (!png) continue
      await writeFile(join(this.imageDirectory, `${image.name}.png`), png)
      stored[image.name] = { format: image.format, frameCount: image.frameCount }
    }
    await writeFile(join(this.imageDirectory, MANIFEST_FILE), JSON.stringify(stored))
  }

  async clearImages(): Promise<void> {
    await rm(this.imageDirectory, { recursive: true, force: true })
  }

  async read(installed?: ReadonlySet<string>): Promise<PreviewAssets> {
    try {
      const images = await this.readImages()
      return { images: installed ? images.filter(({ name }) => installed.has(name)) : images }
    } catch {
      return NO_PREVIEW_ASSETS
    }
  }

  private async readImages(): Promise<PreviewImageAsset[]> {
    const manifest = await this.readManifest()
    const images: PreviewImageAsset[] = []
    for (const entry of await listDirectory(this.imageDirectory)) {
      if (!entry.endsWith('.png')) continue
      const name = entry.slice(0, -'.png'.length)
      if (!IMAGE_ID_PATTERN.test(name)) continue
      const bytes = await readFile(join(this.imageDirectory, entry))
      const { width, height } = nativeImage.createFromBuffer(bytes).getSize()
      const stored = manifest[name]
      const frameCount = stored?.frameCount ?? 1
      images.push({
        name,
        width,
        height: Math.round(height / frameCount),
        frameCount,
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        ...(stored?.format ? { format: stored.format } : {})
      })
    }
    return images
  }

  private async readManifest(): Promise<Record<string, StoredImage>> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(this.imageDirectory, MANIFEST_FILE), 'utf8')
      )
      if (!parsed || typeof parsed !== 'object') return {}
      const manifest: Record<string, StoredImage> = {}
      for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue
        const { format, frameCount } = value as Partial<StoredImage>
        if (!IMAGE_COLOR_FORMATS.includes(format as ImageColorFormat)) continue
        manifest[name] = {
          format: format as ImageColorFormat,
          frameCount:
            Number.isSafeInteger(frameCount) && (frameCount as number) >= 1
              ? (frameCount as number)
              : 1
        }
      }
      return manifest
    } catch {
      return {}
    }
  }
}

async function replaceDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
}

async function listDirectory(directory: string): Promise<string[]> {
  try {
    return await readdir(directory)
  } catch {
    return []
  }
}

function encodePng(image: ConvertedImage): Buffer | undefined {
  const pixels = image.width * image.height
  if (pixels <= 0) return undefined
  const frames = Math.max(1, image.frameCount)
  const bgra = Buffer.alloc(pixels * frames * 4)
  const colorBytes = image.format === 'alpha8' ? 0 : pixels * 2
  const frameBytes = colorBytes + (image.format === 'rgb565' ? 0 : pixels)
  for (let frame = 0; frame < frames; ++frame) {
    const source = frame * frameBytes
    const target = frame * pixels
    for (let index = 0; index < pixels; ++index) {
      let red = 0xff
      let green = 0xff
      let blue = 0xff
      if (image.format !== 'alpha8') {
        const packed = image.bytes.readUInt16LE(source + index * 2)
        const red5 = (packed >> 11) & 0x1f
        const green6 = (packed >> 5) & 0x3f
        const blue5 = packed & 0x1f
        red = (red5 << 3) | (red5 >> 2)
        green = (green6 << 2) | (green6 >> 4)
        blue = (blue5 << 3) | (blue5 >> 2)
      }
      const alpha =
        image.format === 'rgb565'
          ? 0xff
          : image.bytes.readUInt8(source + colorBytes + index)
      const out = (target + index) * 4
      bgra[out] = blue
      bgra[out + 1] = green
      bgra[out + 2] = red
      bgra[out + 3] = alpha
    }
  }
  const encoded = nativeImage.createFromBitmap(bgra, {
    width: image.width,
    height: image.height * frames
  })
  return encoded.isEmpty() ? undefined : encoded.toPNG()
}
