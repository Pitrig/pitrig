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
  /** Editor-only, keyed by widget id: none of these reach the document. */
  locked: Record<string, boolean>
  hidden: Record<string, boolean>
  /**
   * Containers whose contents the layer list is not showing. Absent means open,
   * so a container is expanded until the author folds it — a list that hid its
   * own contents by default would bury the thing most often looked for.
   */
  collapsed: Record<string, boolean>
  /**
   * Which page of each slot the canvas draws, keyed by the slot's widget id. The
   * board shows one at a time and picks it from a tap or a trigger; the editor
   * has to author all of them, so it picks one to look at instead.
   */
  slotPage: Record<string, number>
  /**
   * The container being worked inside, if any — a shape, or a slot, in which
   * case it is one page at a time. What it changes is what a click on the canvas
   * reaches and where a new widget lands: everything at or below this level is
   * addressable, everything above it is picked as a whole. A way of looking at
   * the document, not a property of it.
   */
  drillIn?: string
  /**
   * The family a new widget takes. Editor-only, and deliberately so: the device
   * resolves a font per widget and the contract declares no document-level one,
   * so a default that lived in the document would be a property the board
   * rejects. Choosing one here seeds what is added next; "apply to every
   * widget" is what changes what is already there.
   */
  defaultFontFamily?: string
  setDefaultFontFamily: (family: string) => void
  select: (selection?: WidgetSelection) => void
  /** Adds or removes one widget, keeping it primary when it stays selected. */
  extendSelection: (id: string) => void
  selectMany: (ids: readonly string[]) => void
  setActiveScreen: (index: number) => void
  setSlotPage: (slotId: string, page: number) => void
  /** Works inside a container, or leaves every one of them when given nothing. */
  setDrillIn: (containerId?: string) => void
  setView: (patch: Partial<EditorView>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  toggleCollapsed: (id: string) => void
  /** Opens every container named, which is how a selection is revealed in the list. */
  expand: (ids: readonly string[]) => void
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
  locked: {},
  hidden: {},
  collapsed: {},
  slotPage: {},
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
  // Selection belongs to one screen, so switching screens drops it rather than
  // leaving the inspector editing something the canvas no longer draws.
  // A container belongs to one screen, so leaving the screen leaves it too.
  setActiveScreen: (index) =>
    set({
      activeScreenIndex: Math.max(index, 0),
      selection: undefined,
      selectedIds: [],
      drillIn: undefined
    }),
  setSlotPage: (slotId, page) =>
    set((current) => ({ slotPage: { ...current.slotPage, [slotId]: Math.max(page, 0) } })),
  // Entering a container selects it, so the inspector lands on the thing just
  // opened rather than on nothing.
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
  // A different document is a different set of widgets, so what was locked,
  // hidden or selected in the previous one describes nothing.
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
      view: DEFAULT_EDITOR_VIEW,
    })
}))
