import { create } from 'zustand'

import type { AssetUploadProgress } from '@shared/asset-upload'

export interface UploadOperationState {
  progress?: AssetUploadProgress
  error?: string
  running: boolean
  setProgress: (progress?: AssetUploadProgress) => void
  setError: (error?: string) => void
  begin: () => boolean
  end: () => void
}

export function createUploadOperationStore() {
  return create<UploadOperationState>((set, get) => ({
    running: false,
    setProgress: (progress) => set({ progress }),
    setError: (error) => set({ error }),
    begin: () => {
      if (get().running) return false
      set({ running: true, error: undefined })
      return true
    },
    end: () => set({ running: false })
  }))
}
