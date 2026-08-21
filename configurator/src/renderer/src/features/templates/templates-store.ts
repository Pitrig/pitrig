import { create } from 'zustand'

import { TEMPLATE_FORMAT, type TemplateLibrary } from '@shared/templates'
import type { DeviceConfiguration } from '@shared/device'

// The template library as the renderer sees it. A dashboard's document is read
// on demand, because applying one is the only thing that wants it and holding
// four documents to draw four rows would be four copies of a configuration for
// nothing. A widget entry is the exception and arrives whole: the row draws the
// fragment itself, and pressing Add hands the same bytes to the canvas.

/**
 * The empty listing every selector falls back to.
 *
 * A selector must return the same reference for the same state — zustand feeds
 * it to `useSyncExternalStore`, which re-renders until two consecutive reads
 * agree. `state.library?.dashboards ?? []` builds a fresh array on every call
 * while the library is still loading, which is an infinite render rather than
 * an empty list.
 */
export const NO_TEMPLATES: TemplateLibrary = { dashboards: [], widgets: [], unreadable: 0 }

/**
 * A dashboard's document, once a card has asked for it.
 *
 * Cards draw what the template looks like, which needs the whole document —
 * but only for the templates actually on screen, and only once each. Holding
 * every document in the listing instead would put four configurations on the
 * wire to draw four rows, which is what the listing was shaped to avoid.
 */
export type TemplateDocumentState = 'loading' | 'failed' | DeviceConfiguration

interface TemplatesStore {
  library?: TemplateLibrary
  documents: Readonly<Record<string, TemplateDocumentState>>
  loading: boolean
  error?: string
  setError: (error?: string) => void
  refresh: () => Promise<void>
  /** Reads one dashboard's document, at most once per identifier. */
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
      // A refresh follows a write, so a document read before it may now be a
      // document of something else under the same name.
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
