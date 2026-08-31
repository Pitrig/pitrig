import { app, nativeImage } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface BenchSpriteSheet {
  paths: string[]
  edge: number
}

export const BENCH_IMAGE_NAME = 'bench_dial'

export async function writeBenchSprite(edge: number, frames: number): Promise<BenchSpriteSheet> {
  const size = Math.max(16, Math.min(160, Math.round(edge)))
  const directory = join(app.getPath('temp'), 'simcore-bench-sprite')
  await mkdir(directory, { recursive: true })
  const paths: string[] = []
  for (let frame = 0; frame < frames; ++frame) {
    const bitmap = drawDial(size, frame, frames)
    const png = nativeImage.createFromBitmap(bitmap, { width: size, height: size }).toPNG()
    const path = join(directory, `${BENCH_IMAGE_NAME}-${size}-${frame}.png`)
    await writeFile(path, png)
    paths.push(path)
  }
  return { paths, edge: size }
}

function drawDial(size: number, frame: number, frames: number): Buffer {
  const bitmap = Buffer.alloc(size * size * 4)
  const centre = (size - 1) / 2
  const radius = centre - 1
  const needle = (frame / frames) * Math.PI * 2 - Math.PI / 2
  const ring = hue(frame / frames)
  for (let y = 0; y < size; ++y) {
    for (let x = 0; x < size; ++x) {
      const dx = x - centre
      const dy = y - centre
      const distance = Math.sqrt(dx * dx + dy * dy)
      const offset = (y * size + x) * 4
      let colour: [number, number, number] = [11, 18, 32]
      if (distance <= radius) {
        if (distance > radius * 0.78) {
          colour = ring
        } else if (distance < radius * 0.7 && angleDistance(Math.atan2(dy, dx), needle) < 0.28) {
          colour = [226, 232, 240]
        } else {
          colour = [24, 34, 54]
        }
      }
      bitmap[offset] = colour[2]
      bitmap[offset + 1] = colour[1]
      bitmap[offset + 2] = colour[0]
      bitmap[offset + 3] = 255
    }
  }
  return bitmap
}

function angleDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % (Math.PI * 2)
  return delta > Math.PI ? Math.PI * 2 - delta : delta
}

function hue(position: number): [number, number, number] {
  const sector = ((position % 1) + 1) % 1
  const channel = (shift: number): number => {
    const value = Math.abs((((sector + shift) % 1) * 6) - 3) - 1
    return Math.round(255 * Math.min(1, Math.max(0.15, value)))
  }
  return [channel(0), channel(2 / 3), channel(1 / 3)]
}
