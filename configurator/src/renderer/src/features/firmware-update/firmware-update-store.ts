import { create } from 'zustand'

import type { FirmwareSourceSelection, FirmwareUploadProgress } from '@shared/firmware-update'

interface FirmwareUpdateStore {
  source?: FirmwareSourceSelection
  progress?: FirmwareUploadProgress
  error?: string
  operationStartedAt?: number
  setSource: (source?: FirmwareSourceSelection) => void
  setProgress: (progress?: FirmwareUploadProgress) => void
  setError: (error?: string) => void
  beginOperation: () => void
  endOperation: () => void
}

export const useFirmwareUpdateStore = create<FirmwareUpdateStore>((set) => ({
  setSource: (source) => set({ source, progress: undefined, error: undefined }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  beginOperation: () => set({ operationStartedAt: Date.now(), error: undefined }),
  endOperation: () => set({ operationStartedAt: undefined })
}))
