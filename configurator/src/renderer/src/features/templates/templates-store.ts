import { create } from 'zustand'

import type { DashboardTemplateLibrary } from '@shared/templates'

// The template library as the renderer sees it. Only what the list needs lives
// here — a template's document is read on demand, because applying one is the
// only thing that wants it and holding four documents to draw four rows would
// be four copies of a configuration for nothing.

interface TemplatesStore {
  library?: DashboardTemplateLibrary
  loading: boolean
  error?: string
  setError: (error?: string) => void
  refresh: () => Promise<void>
}

export const useTemplatesStore = create<TemplatesStore>((set) => ({
  loading: false,
  setError: (error) => set({ error }),
  refresh: async () => {
    set({ loading: true, error: undefined })
    try {
      const result = await window.simcore.listDashboardTemplates()
      if (result.ok) set({ library: result.value })
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
