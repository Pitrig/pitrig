import type { ImageColorFormat } from './image-assets'

export const PREVIEW_ASSETS_READ_CHANNEL = 'preview-assets:read' as const

/**
 * One installed image, as the device holds it: already resized, and already
 * reduced to the colour format it was converted to. Drawing this rather than
 * the source file is the point — a photograph in RGB565 banks visibly, and the
 * author should see that here rather than on the board.
 *
 * There is no font counterpart. A face is not recovered from a board either,
 * but it never had to be: the configurator's font library holds it whether or
 * not any board was ever given it.
 */
export interface PreviewImageAsset {
  name: string
  width: number
  height: number
  dataUrl: string
  /**
   * The colour format it was converted to, which the PNG beside it cannot say:
   * an `alpha8` bitmap is cached as white coverage, and the board paints that
   * coverage in the widget's recolour rather than tinting pixels it already
   * has. Absent when the cache predates this and the preview falls back to
   * treating the bitmap as carrying its own colours.
   */
  format?: ImageColorFormat
  /**
   * How many frames the strip in `dataUrl` holds. 1 for an ordinary image; more
   * make it a sprite sheet, whose frames are stacked in order, each `height`
   * tall, so drawing one is a window onto the strip.
   */
  frameCount: number
}

export interface PreviewAssets {
  images: PreviewImageAsset[]
}

export const NO_PREVIEW_ASSETS: PreviewAssets = { images: [] }
