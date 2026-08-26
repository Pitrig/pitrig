import type { ImageColorFormat } from './image-assets'

export const PREVIEW_ASSETS_READ_CHANNEL = 'preview-assets:read' as const

export interface PreviewImageAsset {
  name: string
  width: number
  height: number
  dataUrl: string
  format?: ImageColorFormat
  frameCount: number
}

export interface PreviewAssets {
  images: PreviewImageAsset[]
}

export const NO_PREVIEW_ASSETS: PreviewAssets = { images: [] }
