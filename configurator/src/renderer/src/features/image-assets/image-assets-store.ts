import { create } from 'zustand'

import type { AssetUploadProgress } from '@shared/asset-upload'
import type { ImageColorFormat, ImageSourceSelection } from '@shared/image-assets'

// One row of the upload list: the picked files plus what they should become on
// the device. The size defaults to the first source's own, because the board
// draws an image at the size it was uploaded at — there is no scaling to fall
// back on.
//
// More than one file makes the row a sprite sheet: the frames are converted to
// one geometry and stored back to back, so a widget switches between them from
// telemetry and the whole set costs one of the device's 32 entries.

export interface ImageEntry {
  /** Stable across adding and removing frames, unlike any one source's id. */
  id: string
  sources: ImageSourceSelection[]
  name: string
  format: ImageColorFormat
  width: number
  height: number
  /**
   * Whether editing one side recomputes the other from the source's shape. On
   * by default: shrinking is the usual reason to touch these at all — a widget
   * wants a fraction of what a source file happens to be — and doing it one
   * side at a time is how an image ends up quietly squashed.
   */
  lockAspect: boolean
}

interface ImageAssetsStore {
  entries: ImageEntry[]
  progress?: AssetUploadProgress
  error?: string
  operationStartedAt?: number
  addEntry: (source: ImageSourceSelection) => void
  updateEntry: (id: string, patch: Partial<Omit<ImageEntry, 'id' | 'sources'>>) => void
  /** Sets one side, carrying the other with it while the shape is locked. */
  resizeEntry: (id: string, side: 'width' | 'height', value: number) => void
  removeEntry: (id: string) => void
  /** Appends a frame to an existing row, turning a plain image into a sheet. */
  addFrame: (id: string, source: ImageSourceSelection) => void
  /** Drops one frame; dropping the last one drops the row. */
  removeFrame: (id: string, sourceId: string) => void
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
          id: source.id,
          sources: [source],
          name: suggestedName(source.name) || `image-${state.entries.length + 1}`,
          // The alpha plane is a third of the image, in flash and in the board's
          // external RAM alike, so it is offered only to artwork that actually
          // uses one — a PNG usually carries the channel either way. Still just
          // a default: the row's format control overrides it.
          format: source.hasAlpha ? 'rgb565a8' : 'rgb565',
          // The source's own size, because the board draws an image at the size
          // it was uploaded at and there is no scaling to fall back on. It is
          // rarely the size a widget wants, which is what the readout under the
          // fields is for.
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
        // Against the source rather than against the current pair, so a series
        // of edits cannot drift the shape one rounding at a time.
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
        // A row with no frames left is a row with no image, which is the same
        // thing as having removed it.
        return sources.length === 0 ? [] : [{ ...entry, sources }]
      })
    })),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  beginOperation: () => set({ operationStartedAt: Date.now(), error: undefined }),
  endOperation: () => set({ operationStartedAt: undefined })
}))
