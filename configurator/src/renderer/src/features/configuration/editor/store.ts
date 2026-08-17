import { create } from 'zustand'

export type WidgetSelection =
  | { type: 'screen' }
  | { type: 'widget'; id: string }

/**
 * How the canvas is being looked at, and which widgets are set aside while
 * working. None of this belongs in the document: the device would reject the
 * unknown properties, and a grid or a locked layer is a fact about the editing
 * session rather than about the dashboard.
 */
export interface EditorView {
  zoom: number
  panX: number
  panY: number
  gridSize: number
  snapToGrid: boolean
}

/**
 * What the canvas draws in place of telemetry. The configurator never receives
 * any: the control protocol has no command for it and the port belongs to
 * SimHub while a session is running, so `values` plays a synthetic lap
 * generated in the renderer.
 *
 * `unavailable` is not the same as `placeholders`: it is what the dashboard
 * looks like when the game stops sending, which is the state `unavailable_text`
 * and a hiding rule exist for, and which the live mode would otherwise make
 * impossible to see.
 */
export type PreviewValueMode = 'placeholders' | 'values' | 'unavailable'

export interface PreviewPlayback {
  mode: PreviewValueMode
  playing: boolean
  /** Position in the synthetic lap, 0 to 1. */
  phase: number
}

export const DEFAULT_PREVIEW_PLAYBACK: PreviewPlayback = {
  mode: 'placeholders',
  playing: true,
  phase: 0
}

export const DEFAULT_EDITOR_VIEW: EditorView = {
  zoom: 1,
  panX: 0,
  panY: 0,
  gridSize: 8,
  snapToGrid: false
}

export const MINIMUM_ZOOM = 1
export const MAXIMUM_ZOOM = 8

interface DashboardEditorStore {
  /**
   * The widget the inspector edits. Always the most recently picked member of
   * `selectedIds`, so single-widget editing and multi-widget arrangement read
   * the same selection from two angles instead of keeping two of them.
   */
  selection?: WidgetSelection
  selectedIds: string[]
  /**
   * The screen the canvas, the layer list and the inspector are working on.
   * Editor-only: which screen is being authored says nothing about the
   * dashboard, and the device always starts at the first one.
   */
  activeScreenIndex: number
  view: EditorView
  preview: PreviewPlayback
  /** Editor-only, keyed by widget id: neither reaches the document. */
  locked: Record<string, boolean>
  hidden: Record<string, boolean>
  /**
   * Which group of each slot the canvas draws, keyed by slot number. The board
   * shows one at a time and picks it from a tap or a rule; the editor has to
   * author all of them, so it picks one to look at instead.
   */
  previewSlots: Record<number, string>
  select: (selection?: WidgetSelection) => void
  /** Adds or removes one widget, keeping it primary when it stays selected. */
  extendSelection: (id: string) => void
  selectMany: (ids: readonly string[]) => void
  setActiveScreen: (index: number) => void
  setPreviewSlot: (slot: number, groupId: string) => void
  setView: (patch: Partial<EditorView>) => void
  setPreview: (patch: Partial<PreviewPlayback>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  /**
   * Moves every id-keyed piece of editor state from one id to another. A rename
   * rewrites the widget's id in the document, and anything still keyed by the
   * old one — selection, lock, hide — would silently detach from it.
   */
  renameId: (from: string, to: string) => void
  resetEditorState: () => void
}

export const useDashboardEditorStore = create<DashboardEditorStore>((set) => ({
  selectedIds: [],
  activeScreenIndex: 0,
  view: DEFAULT_EDITOR_VIEW,
  preview: DEFAULT_PREVIEW_PLAYBACK,
  locked: {},
  hidden: {},
  previewSlots: {},
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
  // Selection belongs to one screen, so switching screens drops it rather than
  // leaving the inspector editing something the canvas no longer draws.
  setActiveScreen: (index) =>
    set({ activeScreenIndex: Math.max(index, 0), selection: undefined, selectedIds: [] }),
  setPreviewSlot: (slot, groupId) =>
    set((current) => ({ previewSlots: { ...current.previewSlots, [slot]: groupId } })),
  setView: (patch) => set((current) => ({ view: { ...current.view, ...patch } })),
  setPreview: (patch) => set((current) => ({ preview: { ...current.preview, ...patch } })),
  toggleLocked: (id) =>
    set((current) => ({ locked: { ...current.locked, [id]: !current.locked[id] } })),
  toggleHidden: (id) =>
    set((current) => ({ hidden: { ...current.hidden, [id]: !current.hidden[id] } })),
  renameId: (from, to) =>
    set((current) => {
      const move = (record: Record<string, boolean>): Record<string, boolean> => {
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
        hidden: move(current.hidden)
      }
    }),
  // A different document is a different set of widgets, so what was locked,
  // hidden or selected in the previous one describes nothing.
  resetEditorState: () =>
    set({
      selection: undefined,
      selectedIds: [],
      activeScreenIndex: 0,
      locked: {},
      hidden: {},
      previewSlots: {},
      view: DEFAULT_EDITOR_VIEW,
      preview: DEFAULT_PREVIEW_PLAYBACK
    })
}))
