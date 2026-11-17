import { create } from 'zustand'

import { EMPTY_IMAGE_LIBRARY, type ImageLibrarySnapshot } from '@shared/image-library'
import { usePreviewAssetStore } from '@/features/configuration/preview/preview-assets'

interface ImageLibraryState {
  snapshot: ImageLibrarySnapshot
  refresh: () => Promise<void>
}

export const useImageLibraryStore = create<ImageLibraryState>((set) => ({
  snapshot: EMPTY_IMAGE_LIBRARY,
  refresh: async () => {
    const snapshot = await window.pitrig.listImageLibrary().catch(() => undefined)
    if (snapshot) set({ snapshot })
  }
}))

export function subscribeToImageLibrary(): () => void {
  void useImageLibraryStore.getState().refresh()
  return window.pitrig.onImageLibraryChanged((snapshot) => {
    useImageLibraryStore.setState({ snapshot })
    void usePreviewAssetStore.getState().refresh()
  })
}
