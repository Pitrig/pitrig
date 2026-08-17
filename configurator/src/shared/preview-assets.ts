export const PREVIEW_ASSETS_READ_CHANNEL = 'preview-assets:read' as const

/**
 * One uploaded face, kept so the canvas can draw with the font the board
 * rasterizes instead of a stand-in. The bytes are the uploaded file unchanged,
 * and they cross as bytes rather than as a URL because the renderer's policy
 * allows `data:` for images only — `FontFace` takes a buffer directly, so no
 * policy has to be widened for the preview to have its font.
 */
export interface PreviewFontAsset {
  family: string
  bytes: Uint8Array
}

/**
 * One installed image, as the device holds it: already resized, and already
 * reduced to the colour format it was converted to. Drawing this rather than
 * the source file is the point — a photograph in RGB565 banks visibly, and the
 * author should see that here rather than on the board.
 */
export interface PreviewImageAsset {
  name: string
  width: number
  height: number
  dataUrl: string
}

export interface PreviewAssets {
  fonts: PreviewFontAsset[]
  images: PreviewImageAsset[]
}

export const NO_PREVIEW_ASSETS: PreviewAssets = { fonts: [], images: [] }
