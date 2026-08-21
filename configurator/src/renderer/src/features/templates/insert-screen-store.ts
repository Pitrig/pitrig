import { create } from 'zustand'

import type { DashboardTemplateSummary } from '@shared/templates'

/**
 * Whether the screen picker is open, and on what.
 *
 * It is a store rather than the dialog's own state because two very different
 * things open it: a context-menu entry — a plain function built in
 * `menu-entries`, with no component around it to hold a flag — and a card's
 * `Add`, which already knows which template it means and can skip the first
 * step.
 */
interface InsertScreenStore {
  open: boolean
  /** Preselected by a card; absent when the menu opened it and asks first. */
  template?: DashboardTemplateSummary
  openPicker: (template?: DashboardTemplateSummary) => void
  close: () => void
}

export const useInsertScreenStore = create<InsertScreenStore>((set) => ({
  open: false,
  openPicker: (template) => set({ open: true, template }),
  close: () => set({ open: false, template: undefined })
}))
