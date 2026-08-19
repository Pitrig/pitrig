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
}

export interface PreviewAssets {
  images: PreviewImageAsset[]
}

export const NO_PREVIEW_ASSETS: PreviewAssets = { images: [] }
