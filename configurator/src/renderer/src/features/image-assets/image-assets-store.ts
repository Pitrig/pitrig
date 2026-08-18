import { create } from 'zustand'

import type { AssetUploadProgress } from '@shared/asset-upload'
import type { ImageColorFormat, ImageSourceSelection } from '@shared/image-assets'

// One row of the upload list: a picked file plus what it should become on the
// device. The size defaults to the source's own, because the board draws an
// image at the size it was uploaded at — there is no scaling to fall back on.

export interface ImageEntry {
  source: ImageSourceSelection
  name: string
  format: ImageColorFormat
  width: number
  height: number
}

interface ImageAssetsStore {
  entries: ImageEntry[]
  progress?: AssetUploadProgress
  error?: string
  operationStartedAt?: number
  addEntry: (source: ImageSourceSelection) => void
  updateEntry: (id: string, patch: Partial<Omit<ImageEntry, 'source'>>) => void
  removeEntry: (id: string) => void
  setProgress: (progress?: AssetUploadProgress) => void
  setError: (error?: string) => void
  beginOperation: () => void
  endOperation: () => void
}

/** `icon.png` → `icon`, lower case, with anything the device rejects removed. */
function suggestedName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31)
}

export const useImageAssetsStore = create<ImageAssetsStore>((set) => ({
  entries: [],
  addEntry: (source) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          source,
          name: suggestedName(source.name) || `image-${state.entries.length + 1}`,
          // RGB565 with an alpha plane is what an icon over a dashboard needs;
          // a photograph without transparency can be switched to plain RGB565.
          format: 'rgb565a8',
          width: source.width,
          height: source.height
        }
      ]
    })),
  updateEntry: (id, patch) =>
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.source.id === id ? { ...entry, ...patch } : entry
      )
    })),
  removeEntry: (id) =>
    set((state) => ({ entries: state.entries.filter((entry) => entry.source.id !== id) })),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  beginOperation: () => set({ operationStartedAt: Date.now(), error: undefined }),
  endOperation: () => set({ operationStartedAt: undefined })
}))
