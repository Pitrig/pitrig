import { create } from 'zustand'

import { createUploadOperationStore } from '@/lib/upload-operation-store'
import type { FirmwareSourceSelection } from '@shared/firmware-update'

interface FirmwareSourceStore {
  source?: FirmwareSourceSelection
  setSource: (source?: FirmwareSourceSelection) => void
}

export const useFirmwareUploadStore = createUploadOperationStore()

export const useFirmwareUpdateStore = create<FirmwareSourceStore>((set) => ({
  setSource: (source) => set({ source })
}))
