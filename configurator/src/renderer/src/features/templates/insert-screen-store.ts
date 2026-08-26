import { create } from 'zustand'

import type { DashboardTemplateSummary } from '@shared/templates'

interface InsertScreenStore {
  open: boolean
  template?: DashboardTemplateSummary
  openPicker: (template?: DashboardTemplateSummary) => void
  close: () => void
}

export const useInsertScreenStore = create<InsertScreenStore>((set) => ({
  open: false,
  openPicker: (template) => set({ open: true, template }),
  close: () => set({ open: false, template: undefined })
}))
