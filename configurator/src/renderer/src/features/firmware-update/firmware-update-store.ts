import { create } from 'zustand'

import type { FirmwareSourceSelection } from '@shared/firmware-update'

interface FirmwareSourceStore {
  source?: FirmwareSourceSelection
  setSource: (source?: FirmwareSourceSelection) => void
}

export const useFirmwareUpdateStore = create<FirmwareSourceStore>((set) => ({
  setSource: (source) => set({ source })
}))
