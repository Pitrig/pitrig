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

/**
 * A copy of every image the configurator installs, so the editor can draw what
 * the board draws.
 *
 * A converted bitmap exists nowhere else: it arrives at the device already
 * resized and already reduced to its colour format, and the picked source file
 * is only a path held in memory for the length of one session. Without this the
 * canvas would fall back to a named box for the rest of the project's life.
 *
 * Faces are deliberately not here. They were, back when uploading was the only
 * way the configurator ever held one; the font library owns them now, and it
 * answers whether or not a board was ever given them.
 *
 * A package is replaced whole on the device, so the cache is replaced whole
 * too; anything else would leave it describing images the board no longer
 * holds. It is a cache and nothing depends on it: a missing or unreadable entry
 * costs the preview its fidelity, never its correctness.
 */

// Not an image id, so it can never collide with one: the pattern allows no dot.
const MANIFEST_FILE = 'formats.json'

/** What the PNG beside it cannot say about how the device holds it. */
interface StoredImage {
  format: ImageColorFormat
  frameCount: number
}

export class PreviewAssetCache {
  private readonly imageDirectory: string

  constructor(directory: string) {
    this.imageDirectory = join(directory, 'images')
  }

  /** Replaces the cached bitmaps with the ones just uploaded. */
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
    // What a PNG cannot say about itself. The bitmap is the picture; this is
    // how the device holds it — which decides whether the recolour tints those
    // pixels or supplies the only colour they have, and how many frames the one
    // tall strip on disk is really made of.
    await writeFile(join(this.imageDirectory, MANIFEST_FILE), JSON.stringify(stored))
  }

  async clearImages(): Promise<void> {
    await rm(this.imageDirectory, { recursive: true, force: true })
  }

  async read(): Promise<PreviewAssets> {
    try {
      return { images: await this.readImages() }
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
        // A sheet is one tall strip on disk; a frame is a window onto it, so
        // what a widget draws is this height rather than the file's.
        height: Math.round(height / frameCount),
        frameCount,
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        ...(stored?.format ? { format: stored.format } : {})
      })
    }
    return images
  }

  /**
   * The manifest is an aid, not a record: a cache written before it existed, or
   * one whose manifest will not parse, leaves every format unknown and every
   * image a single frame, and the preview draws each bitmap as carrying its own
   * colours — which is exactly what it did before any of this existed.
   */
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

/**
 * The converted pixels back as a PNG. The device's own bytes are the source, so
 * what the canvas draws carries the resize and the colour reduction the upload
 * applied rather than the artwork that went in.
 *
 * A sheet becomes one tall strip, its frames in order. The device's own layout
 * is whole frames back to back and a frame is a whole number of rows, so the
 * strip is that same run of bytes read as one taller picture — and the canvas
 * draws a frame by windowing it.
 */
function encodePng(image: ConvertedImage): Buffer | undefined {
  const pixels = image.width * image.height
  if (pixels <= 0) return undefined
  const frames = Math.max(1, image.frameCount)
  const bgra = Buffer.alloc(pixels * frames * 4)
  // Per frame: the colour plane, then the alpha plane at half its stride.
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
        // RGB565 little endian, expanded by repeating the high bits so full
        // white stays white rather than landing one step short.
        const packed = image.bytes.readUInt16LE(source + index * 2)
        const red5 = (packed >> 11) & 0x1f
        const green6 = (packed >> 5) & 0x3f
        const blue5 = packed & 0x1f
        red = (red5 << 3) | (red5 >> 2)
        green = (green6 << 2) | (green6 >> 4)
        blue = (blue5 << 3) | (blue5 >> 2)
      }
      // An A8 image carries no colour of its own: the board draws it in the
      // widget's recolour, so the cache holds the coverage as white.
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
