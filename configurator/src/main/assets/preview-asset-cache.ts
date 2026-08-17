import { nativeImage } from 'electron'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FONT_FAMILY_PATTERN } from '../../shared/font-assets'
import { IMAGE_ID_PATTERN } from '../../shared/image-assets'
import {
  NO_PREVIEW_ASSETS,
  type PreviewAssets,
  type PreviewFontAsset,
  type PreviewImageAsset
} from '../../shared/preview-assets'
import type { ConvertedImage } from '../image-assets/image-package'

/**
 * A copy of every asset the configurator installs, so the editor can draw what
 * the board draws.
 *
 * Neither asset can be recovered otherwise: the device rasterizes a face and
 * stores no readable copy, an image arrives already converted, and the picked
 * source file is only a path held in memory for the length of one session. The
 * canvas would otherwise fall back to a stand-in system font and a named box
 * for the rest of the project's life.
 *
 * A package is replaced whole on the device, so the cache is replaced whole
 * too; anything else would leave it describing assets the board no longer
 * holds. It is a cache and nothing depends on it: a missing or unreadable entry
 * costs the preview its fidelity, never its correctness.
 */
export class PreviewAssetCache {
  private readonly fontDirectory: string
  private readonly imageDirectory: string

  constructor(directory: string) {
    this.fontDirectory = join(directory, 'fonts')
    this.imageDirectory = join(directory, 'images')
  }

  /** Replaces the cached faces with the ones just uploaded. */
  async storeFonts(faces: readonly { family: string; bytes: Uint8Array }[]): Promise<void> {
    await replaceDirectory(this.fontDirectory)
    for (const face of faces) {
      // The family is what names the file, so a family that could escape the
      // directory is one that never gets written.
      if (!FONT_FAMILY_PATTERN.test(face.family)) continue
      await writeFile(join(this.fontDirectory, `${face.family}.font`), face.bytes)
    }
  }

  /** Replaces the cached bitmaps with the ones just uploaded. */
  async storeImages(images: readonly ConvertedImage[]): Promise<void> {
    await replaceDirectory(this.imageDirectory)
    for (const image of images) {
      if (!IMAGE_ID_PATTERN.test(image.name)) continue
      const png = encodePng(image)
      if (png) await writeFile(join(this.imageDirectory, `${image.name}.png`), png)
    }
  }

  async clearFonts(): Promise<void> {
    await rm(this.fontDirectory, { recursive: true, force: true })
  }

  async clearImages(): Promise<void> {
    await rm(this.imageDirectory, { recursive: true, force: true })
  }

  async read(): Promise<PreviewAssets> {
    try {
      return {
        fonts: await this.readFonts(),
        images: await this.readImages()
      }
    } catch {
      return NO_PREVIEW_ASSETS
    }
  }

  private async readFonts(): Promise<PreviewFontAsset[]> {
    const fonts: PreviewFontAsset[] = []
    for (const entry of await listDirectory(this.fontDirectory)) {
      if (!entry.endsWith('.font')) continue
      const family = entry.slice(0, -'.font'.length)
      if (!FONT_FAMILY_PATTERN.test(family)) continue
      const bytes = await readFile(join(this.fontDirectory, entry))
      fonts.push({ family, bytes: new Uint8Array(bytes) })
    }
    return fonts
  }

  private async readImages(): Promise<PreviewImageAsset[]> {
    const images: PreviewImageAsset[] = []
    for (const entry of await listDirectory(this.imageDirectory)) {
      if (!entry.endsWith('.png')) continue
      const name = entry.slice(0, -'.png'.length)
      if (!IMAGE_ID_PATTERN.test(name)) continue
      const bytes = await readFile(join(this.imageDirectory, entry))
      const { width, height } = nativeImage.createFromBuffer(bytes).getSize()
      images.push({
        name,
        width,
        height,
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`
      })
    }
    return images
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
 */
function encodePng(image: ConvertedImage): Buffer | undefined {
  const pixels = image.width * image.height
  if (pixels <= 0) return undefined
  const bgra = Buffer.alloc(pixels * 4)
  const colorBytes = image.format === 'alpha8' ? 0 : pixels * 2
  for (let index = 0; index < pixels; ++index) {
    let red = 0xff
    let green = 0xff
    let blue = 0xff
    if (image.format !== 'alpha8') {
      // RGB565 little endian, expanded by repeating the high bits so full
      // white stays white rather than landing one step short.
      const packed = image.bytes.readUInt16LE(index * 2)
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
      image.format === 'rgb565' ? 0xff : image.bytes.readUInt8(colorBytes + index)
    bgra[index * 4] = blue
    bgra[index * 4 + 1] = green
    bgra[index * 4 + 2] = red
    bgra[index * 4 + 3] = alpha
  }
  const encoded = nativeImage.createFromBitmap(bgra, {
    width: image.width,
    height: image.height
  })
  return encoded.isEmpty() ? undefined : encoded.toPNG()
}
