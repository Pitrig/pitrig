import { create } from 'zustand'

import { TEMPLATE_FORMAT, type TemplateLibrary } from '@shared/templates'
import type { DeviceConfiguration } from '@shared/device'

export const NO_TEMPLATES: TemplateLibrary = { dashboards: [], widgets: [], unreadable: 0 }

export type TemplateDocumentState = 'loading' | 'failed' | DeviceConfiguration

interface TemplatesStore {
  library?: TemplateLibrary
  documents: Readonly<Record<string, TemplateDocumentState>>
  loading: boolean
  error?: string
  setError: (error?: string) => void
  refresh: () => Promise<void>
  loadDocument: (id: string) => void
}

export const useTemplatesStore = create<TemplatesStore>((set, get) => ({
  documents: {},
  loading: false,
  setError: (error) => set({ error }),
  loadDocument: (id) => {
    if (get().documents[id]) return
    set((state) => ({ documents: { ...state.documents, [id]: 'loading' } }))
    void window.simcore
      .readTemplate({ id, kind: 'dashboard' })
      .then((result) =>
        set((state) => ({
          documents: {
            ...state.documents,
            [id]:
              result.ok && result.value.format === TEMPLATE_FORMAT
                ? result.value.configuration
                : 'failed'
          }
        }))
      )
      .catch(() =>
        set((state) => ({ documents: { ...state.documents, [id]: 'failed' } }))
      )
  },
  refresh: async () => {
    set({ loading: true, error: undefined })
    try {
      const result = await window.simcore.listTemplates()
      if (result.ok) set({ library: result.value, documents: {} })
      else set({ error: result.error.message })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to read the template library.'
      })
    } finally {
      set({ loading: false })
    }
  }
}))
