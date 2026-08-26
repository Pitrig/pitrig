import { create } from 'zustand'

import { NO_PREVIEW_ASSETS, type PreviewImageAsset } from '@shared/preview-assets'

interface PreviewAssetState {
  images: Readonly<Record<string, PreviewImageAsset>>
  refresh: () => Promise<void>
}

export const usePreviewAssetStore = create<PreviewAssetState>((set) => ({
  images: {},
  refresh: async () => {
    const assets =
      (await window.simcore.readPreviewAssets().catch(() => NO_PREVIEW_ASSETS)) ??
      NO_PREVIEW_ASSETS
    set({ images: Object.fromEntries(assets.images.map((image) => [image.name, image])) })
  }
}))
