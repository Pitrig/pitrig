import { create } from 'zustand'

import type { ConfigurationDocumentId } from '@shared/configuration-schema'

interface DebugConfigsStore {
  document: ConfigurationDocumentId
  edited?: string
  selectDocument: (document: ConfigurationDocumentId) => void
  setEdited: (edited: string) => void
  clearEdited: () => void
}

export const useDebugConfigsStore = create<DebugConfigsStore>((set) => ({
  document: 'dashboard',
  selectDocument: (document) => set({ document, edited: undefined }),
  setEdited: (edited) => set({ edited }),
  clearEdited: () => set({ edited: undefined })
}))
