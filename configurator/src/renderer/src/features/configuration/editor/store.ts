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

const DEFAULT_PREVIEW_PLAYBACK: PreviewPlayback = {
  mode: 'placeholders',
  playing: true,
  phase: 0
}

const DEFAULT_EDITOR_VIEW: EditorView = {
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
   * Which page of each slot the canvas draws, keyed by the slot's widget id. The
   * board shows one at a time and picks it from a tap or a trigger; the editor
   * has to author all of them, so it picks one to look at instead.
   */
  slotPage: Record<string, number>
  /**
   * The slot whose pages are being edited, if any. A slot is an area that
   * switches, so authoring it means looking at one page at a time inside its own
   * box — which is a way of looking at the document, not a property of it.
   */
  drillIn?: string
  select: (selection?: WidgetSelection) => void
  /** Adds or removes one widget, keeping it primary when it stays selected. */
  extendSelection: (id: string) => void
  selectMany: (ids: readonly string[]) => void
  setActiveScreen: (index: number) => void
  setSlotPage: (slotId: string, page: number) => void
  /** Enters a slot's pages, or leaves them when given nothing. */
  setDrillIn: (slotId?: string) => void
  setView: (patch: Partial<EditorView>) => void
  setPreview: (patch: Partial<PreviewPlayback>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  /**
   * Moves every id-keyed piece of editor state from one id to another. A rename
   * rewrites the widget's id in the document, and anything still keyed by the
   * old one — selection, lock, hide, the slot's visible page, the container the
   * editor has drilled into — would silently detach from it. Missing a field
   * here is not cosmetic: an orphaned `drillIn` leaves the editor logically
   * inside a container that no longer exists, and new widgets then land on the
   * screen instead of inside it.
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
  slotPage: {},
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
  // A slot belongs to one screen, so leaving the screen also leaves the slot.
  setActiveScreen: (index) =>
    set({
      activeScreenIndex: Math.max(index, 0),
      selection: undefined,
      selectedIds: [],
      drillIn: undefined
    }),
  setSlotPage: (slotId, page) =>
    set((current) => ({ slotPage: { ...current.slotPage, [slotId]: Math.max(page, 0) } })),
  // Leaving a slot selects it, so the inspector lands on the thing just left
  // rather than on nothing.
  setDrillIn: (slotId) =>
    set(
      slotId === undefined
        ? { drillIn: undefined }
        : { drillIn: slotId, selection: { type: 'widget', id: slotId }, selectedIds: [slotId] }
    ),
  setView: (patch) => set((current) => ({ view: { ...current.view, ...patch } })),
  setPreview: (patch) => set((current) => ({ preview: { ...current.preview, ...patch } })),
  toggleLocked: (id) =>
    set((current) => ({ locked: { ...current.locked, [id]: !current.locked[id] } })),
  toggleHidden: (id) =>
    set((current) => ({ hidden: { ...current.hidden, [id]: !current.hidden[id] } })),
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
        slotPage: move(current.slotPage),
        drillIn: current.drillIn === from ? to : current.drillIn
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
      slotPage: {},
      drillIn: undefined,
      view: DEFAULT_EDITOR_VIEW,
      preview: DEFAULT_PREVIEW_PLAYBACK
    })
}))
