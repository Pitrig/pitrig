import { create } from 'zustand'

import {
  TEMPLATE_FORMAT,
  type TemplateKind,
  type TemplateLibrary,
  type TemplateReadValue
} from '@shared/templates'
import type { DeviceConfiguration } from '@shared/device'
import type { PreviewImages } from '@/features/configuration/preview/preview-assets'

export const NO_TEMPLATES: TemplateLibrary = { dashboards: [], widgets: [], unreadable: 0 }

export type TemplateDocumentState = 'loading' | 'failed' | DeviceConfiguration
export type TemplateImagesState = 'loading' | 'none' | PreviewImages

interface TemplatesStore {
  library?: TemplateLibrary
  documents: Readonly<Record<string, TemplateDocumentState>>
  images: Readonly<Record<string, PreviewImages>>
  widgetImages: Readonly<Record<string, TemplateImagesState>>
  loading: boolean
  error?: string
  setError: (error?: string) => void
  refresh: () => Promise<void>
  loadDocument: (id: string) => void
  loadWidgetImages: (id: string) => void
  forget: (id: string, kind: TemplateKind) => void
}

export const useTemplatesStore = create<TemplatesStore>((set, get) => ({
  documents: {},
  images: {},
  widgetImages: {},
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
          const previews = imagesOf(read)
          return {
            documents: { ...state.documents, [id]: read ? read.configuration : 'failed' },
            ...(previews ? { images: { ...state.images, [id]: previews } } : {})
          }
        })
      )
      .catch(() =>
        set((state) => ({ documents: { ...state.documents, [id]: 'failed' } }))
      )
  },
  loadWidgetImages: (id) => {
    if (get().widgetImages[id]) return
    set((state) => ({ widgetImages: { ...state.widgetImages, [id]: 'loading' } }))
    void window.pitrig
      .readTemplate({ id, kind: 'widget' })
      .then((result) => imagesOf(result.ok ? result.value : undefined) ?? 'none')
      .catch(() => 'none' as const)
      .then((images) =>
        set((state) => ({ widgetImages: { ...state.widgetImages, [id]: images } }))
      )
  },
  forget: (id, kind) =>
    set((state) =>
      kind === 'dashboard'
        ? { documents: without(state.documents, id), images: without(state.images, id) }
        : { widgetImages: without(state.widgetImages, id) }
    ),
  refresh: async () => {
    set({ loading: true, error: undefined })
    try {
      const result = await window.pitrig.listTemplates()
      if (result.ok) {
        const listed = new Set(result.value.dashboards.map((entry) => entry.id))
        const widgets = new Set(result.value.widgets.map((entry) => entry.id))
        set((state) => ({
          library: result.value,
          documents: Object.fromEntries(
            Object.entries(state.documents).filter(
              ([id, document]) => listed.has(id) && typeof document === 'object'
            )
          ),
          widgetImages: Object.fromEntries(
            Object.entries(state.widgetImages).filter(
              ([id, images]) => widgets.has(id) && images !== 'loading'
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

function imagesOf(read: TemplateReadValue | undefined): PreviewImages | undefined {
  const previews = read?.previews ?? []
  return previews.length > 0
    ? Object.fromEntries(previews.map((image) => [image.name, image]))
    : undefined
}

function without<T>(record: Readonly<Record<string, T>>, id: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== id))
}
