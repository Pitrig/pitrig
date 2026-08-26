import { create } from 'zustand'

import type { AssetUploadProgress } from '@shared/asset-upload'
import type { ImageColorFormat, ImageSourceSelection } from '@shared/image-assets'

export interface ImageEntry {
  id: string
  sources: ImageSourceSelection[]
  name: string
  format: ImageColorFormat
  width: number
  height: number
  lockAspect: boolean
}

interface ImageAssetsStore {
  entries: ImageEntry[]
  progress?: AssetUploadProgress
  error?: string
  operationStartedAt?: number
  addEntry: (source: ImageSourceSelection) => void
  updateEntry: (id: string, patch: Partial<Omit<ImageEntry, 'id' | 'sources'>>) => void
  resizeEntry: (id: string, side: 'width' | 'height', value: number) => void
  removeEntry: (id: string) => void
  addFrame: (id: string, source: ImageSourceSelection) => void
  removeFrame: (id: string, sourceId: string) => void
  setProgress: (progress?: AssetUploadProgress) => void
  setError: (error?: string) => void
  beginOperation: () => void
  endOperation: () => void
}

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
          id: source.id,
          sources: [source],
          name: suggestedName(source.name) || `image-${state.entries.length + 1}`,
          format: source.hasAlpha ? 'rgb565a8' : 'rgb565',
          width: source.width,
          height: source.height,
          lockAspect: true
        }
      ]
    })),
  updateEntry: (id, patch) =>
    set((state) => ({
      entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    })),
  resizeEntry: (id, side, value) =>
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== id) return entry
        const wanted = Math.max(1, Math.round(value))
        if (!entry.lockAspect) {
          return { ...entry, [side]: wanted }
        }
        const source = entry.sources[0]
        if (!source || source.width < 1 || source.height < 1) {
          return { ...entry, [side]: wanted }
        }
        const other =
          side === 'width'
            ? Math.round((wanted * source.height) / source.width)
            : Math.round((wanted * source.width) / source.height)
        return side === 'width'
          ? { ...entry, width: wanted, height: Math.max(1, other) }
          : { ...entry, height: wanted, width: Math.max(1, other) }
      })
    })),
  removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
  addFrame: (id, source) =>
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, sources: [...entry.sources, source] } : entry
      )
    })),
  removeFrame: (id, sourceId) =>
    set((state) => ({
      entries: state.entries.flatMap((entry) => {
        if (entry.id !== id) return [entry]
        const sources = entry.sources.filter((source) => source.id !== sourceId)
        return sources.length === 0 ? [] : [{ ...entry, sources }]
      })
    })),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  beginOperation: () => set({ operationStartedAt: Date.now(), error: undefined }),
  endOperation: () => set({ operationStartedAt: undefined })
}))
