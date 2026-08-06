import { create } from 'zustand'

import type { FontSourceSelection, FontUploadProgress } from '../../../../shared/font-assets'

interface FontAssetsStore {
  sources: Record<string, FontSourceSelection | undefined>
  progress?: FontUploadProgress
  error?: string
  operationStartedAt?: number
  setSource: (family: string, source: FontSourceSelection) => void
  setProgress: (progress: FontUploadProgress) => void
  setError: (error?: string) => void
  beginOperation: () => void
}

export const useFontAssetsStore = create<FontAssetsStore>((set) => ({
  sources: {},
  setSource: (family, source) => set((state) => ({
    sources: { ...state.sources, [family]: source },
    error: undefined
  })),
  setProgress: (progress) => set({
    progress,
    ...(progress.stage === 'error' ? {} : { error: undefined })
  }),
  setError: (error) => set({ error }),
  beginOperation: () => set({ progress: undefined, error: undefined, operationStartedAt: Date.now() })
}))
