import { create } from 'zustand'

import type { WidgetConfiguration } from '@shared/configuration-schema'

export type WidgetSelection =
  | { type: 'screen' }
  | { type: 'widget'; id: string }

export type CanvasTool = 'select' | WidgetConfiguration['type'] | 'tap_zone'

export interface PendingInsert {
  widget: WidgetConfiguration
  label: string
}

export interface EditorView {
  zoom: number
  panX: number
  panY: number
}

const DEFAULT_EDITOR_VIEW: EditorView = {
  zoom: 1,
  panX: 0,
  panY: 0
}

export const MINIMUM_ZOOM = 0.25
export const MAXIMUM_ZOOM = 8

interface DashboardEditorStore {
  selection?: WidgetSelection
  selectedIds: string[]
  activeScreenIndex: number
  view: EditorView
  locked: Record<string, boolean>
  hidden: Record<string, boolean>
  collapsed: Record<string, boolean>
  slotPage: Record<string, number>
  drillIn?: string
  defaultFontFamily?: string
  activeTool: CanvasTool
  setActiveTool: (tool: CanvasTool) => void
  pendingInsert?: PendingInsert
  beginInsert: (insert: PendingInsert) => void
  cancelInsert: () => void
  setDefaultFontFamily: (family: string) => void
  select: (selection?: WidgetSelection) => void
  extendSelection: (id: string) => void
  selectMany: (ids: readonly string[]) => void
  setActiveScreen: (index: number) => void
  setSlotPage: (slotId: string, page: number) => void
  setDrillIn: (containerId?: string) => void
  setView: (patch: Partial<EditorView>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  toggleCollapsed: (id: string) => void
  expand: (ids: readonly string[]) => void
  renameId: (from: string, to: string) => void
  resetEditorState: () => void
}

export const useDashboardEditorStore = create<DashboardEditorStore>((set) => ({
  selectedIds: [],
  activeScreenIndex: 0,
  view: DEFAULT_EDITOR_VIEW,
  locked: {},
  hidden: {},
  collapsed: {},
  slotPage: {},
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool, pendingInsert: undefined }),
  beginInsert: (pendingInsert) => set({ pendingInsert, activeTool: 'select' }),
  cancelInsert: () => set({ pendingInsert: undefined }),
  setDefaultFontFamily: (family) => set({ defaultFontFamily: family }),
  select: (selection) =>
    set({
      selection,
      selectedIds: selection?.type === 'widget' ? [selection.id] : []
    }),
  extendSelection: (id) =>
    set((current) => {
      const selected = current.selectedIds.includes(id)
      const ids = selected
        ? current.selectedIds.filter((entry) => entry !== id)
        : [...current.selectedIds, id]
      const primary = ids[ids.length - 1]
      return {
        selectedIds: ids,
        selection: primary === undefined ? undefined : { type: 'widget', id: primary }
      }
    }),
  selectMany: (ids) =>
    set({
      selectedIds: [...ids],
      selection:
        ids.length === 0 ? { type: 'screen' } : { type: 'widget', id: ids[ids.length - 1]! }
    }),
  setActiveScreen: (index) =>
    set({
      activeScreenIndex: Math.max(index, 0),
      selection: undefined,
      selectedIds: [],
      drillIn: undefined
    }),
  setSlotPage: (slotId, page) =>
    set((current) => ({ slotPage: { ...current.slotPage, [slotId]: Math.max(page, 0) } })),
  setDrillIn: (containerId) =>
    set(
      containerId === undefined
        ? { drillIn: undefined }
        : {
            drillIn: containerId,
            selection: { type: 'widget', id: containerId },
            selectedIds: [containerId]
          }
    ),
  setView: (patch) => set((current) => ({ view: { ...current.view, ...patch } })),
  toggleLocked: (id) =>
    set((current) => ({ locked: { ...current.locked, [id]: !current.locked[id] } })),
  toggleHidden: (id) =>
    set((current) => ({ hidden: { ...current.hidden, [id]: !current.hidden[id] } })),
  toggleCollapsed: (id) =>
    set((current) => ({ collapsed: { ...current.collapsed, [id]: !current.collapsed[id] } })),
  expand: (ids) =>
    set((current) => {
      if (ids.every((id) => !current.collapsed[id])) return current
      const collapsed = { ...current.collapsed }
      for (const id of ids) delete collapsed[id]
      return { collapsed }
    }),
  renameId: (from, to) =>
    set((current) => {
      const move = <T,>(record: Record<string, T>): Record<string, T> => {
        const value = record[from]
        if (value === undefined) return record
        const rest = { ...record }
        delete rest[from]
        return { ...rest, [to]: value }
      }
      const selectedIds = current.selectedIds.map((entry) => (entry === from ? to : entry))
      const selection =
        current.selection && current.selection.type !== 'screen' && current.selection.id === from
          ? { ...current.selection, id: to }
          : current.selection
      return {
        selectedIds,
        selection,
        locked: move(current.locked),
        hidden: move(current.hidden),
        collapsed: move(current.collapsed),
        slotPage: move(current.slotPage),
        drillIn: current.drillIn === from ? to : current.drillIn
      }
    }),
  resetEditorState: () =>
    set({
      selection: undefined,
      selectedIds: [],
      activeScreenIndex: 0,
      locked: {},
      hidden: {},
      collapsed: {},
      slotPage: {},
      drillIn: undefined,
      defaultFontFamily: undefined,
      activeTool: 'select',
      pendingInsert: undefined,
      view: DEFAULT_EDITOR_VIEW,
    })
}))
