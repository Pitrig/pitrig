import { create } from 'zustand'

import { TEMPLATE_FORMAT, type TemplateLibrary } from '@shared/templates'
import type { DeviceConfiguration } from '@shared/device'
import type { PreviewImages } from '@/features/configuration/preview/preview-assets'

export const NO_TEMPLATES: TemplateLibrary = { dashboards: [], widgets: [], unreadable: 0 }

export type TemplateDocumentState = 'loading' | 'failed' | DeviceConfiguration

interface TemplatesStore {
  library?: TemplateLibrary
  documents: Readonly<Record<string, TemplateDocumentState>>
  images: Readonly<Record<string, PreviewImages>>
  loading: boolean
  error?: string
  setError: (error?: string) => void
  refresh: () => Promise<void>
  loadDocument: (id: string) => void
}

export const useTemplatesStore = create<TemplatesStore>((set, get) => ({
  documents: {},
  images: {},
  loading: false,
  setError: (error) => set({ error }),
  loadDocument: (id) => {
    if (get().documents[id]) return
    set((state) => ({ documents: { ...state.documents, [id]: 'loading' } }))
    void window.pitrig
      .readTemplate({ id, kind: 'dashboard' })
      .then((result) =>
        set((state) => {
          const read =
            result.ok && result.value.format === TEMPLATE_FORMAT ? result.value : undefined
          const previews = read?.previews ?? []
          return {
            documents: { ...state.documents, [id]: read ? read.configuration : 'failed' },
            ...(previews.length > 0
              ? {
                  images: {
                    ...state.images,
                    [id]: Object.fromEntries(previews.map((image) => [image.name, image]))
                  }
                }
              : {})
          }
        })
      )
      .catch(() =>
        set((state) => ({ documents: { ...state.documents, [id]: 'failed' } }))
      )
  },
  refresh: async () => {
    set({ loading: true, error: undefined })
    try {
      const result = await window.pitrig.listTemplates()
      if (result.ok) {
        const listed = new Set(result.value.dashboards.map((entry) => entry.id))
        set((state) => ({
          library: result.value,
          documents: Object.fromEntries(
            Object.entries(state.documents).filter(
              ([id, document]) => listed.has(id) && typeof document === 'object'
            )
          )
        }))
      } else set({ error: result.error.message })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to read the template library.'
      })
    } finally {
      set({ loading: false })
    }
  }
}))
