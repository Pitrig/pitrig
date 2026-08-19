import { create } from 'zustand'

import { NO_PREVIEW_ASSETS, type PreviewImageAsset } from '@shared/preview-assets'

/**
 * The installed bitmaps the canvas draws with. The board holds an image it
 * never sends back, so these come from the configurator's own copy of what it
 * installed; without one the preview falls back to a named box.
 *
 * Faces are not here. They come from the font library, which holds them whether
 * or not a board was ever given them — see features/font-library.
 */
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
