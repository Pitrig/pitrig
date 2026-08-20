import { create } from 'zustand'

/**
 * How the canvas helps a gesture land: what a dragged or resized box prefers to
 * line up with, how far it reaches for it, and whether a container carries its
 * contents when it grows.
 *
 * Separate from both stores next door on purpose. The dashboard editor store is
 * keyed by the widgets of the document being edited and is thrown away with it,
 * and the panel store describes the window; this describes how the author
 * works, which outlives every document and every window — so, like the panel
 * sizes, it is kept across restarts.
 */

const STORAGE_KEY = 'simcore.editor.snap'

export const MINIMUM_GRID_PX = 1
export const MAXIMUM_GRID_PX = 64
export const MINIMUM_TOLERANCE_PX = 1
export const MAXIMUM_TOLERANCE_PX = 32
export const DEFAULT_TOLERANCE_PX = 10

export interface SnapSettings {
  snapToGrid: boolean
  /**
   * Absent means the board decides, which is what a fresh installation wants: a
   * 480x480 panel and a 1024x600 one do not want the same step. Naming one
   * pins it for every board, because an author who typed a number meant it.
   */
  gridSize?: number
  /** Edges and centres of the neighbours, the container and the display. */
  snapToWidgets: boolean
  /** Gaps equal to a gap that already exists between two neighbours. */
  snapToSpacing: boolean
  /** How far a box reaches for a line, in screen pixels rather than logical ones. */
  tolerancePx: number
  /**
   * Whether a container's contents grow with it. Off, resizing a plate moves
   * its own box and leaves what is inside where the author put it — which is
   * what the device does with an authored offset, and what this editor has
   * always done. On, the whole subtree scales, fonts included.
   *
   * A mode rather than a held key: it changes what a whole session of resizing
   * means, and the four modifier combinations a resize already answers to
   * (proportions, from the centre, grid-only, no snapping) leave nothing free
   * that would not cost one of them.
   */
  scaleContents: boolean
}

interface SnapStore extends SnapSettings {
  setSnap: (patch: Partial<SnapSettings>) => void
  toggleScaleContents: () => void
}

const DEFAULTS: SnapSettings = {
  snapToGrid: true,
  snapToWidgets: true,
  snapToSpacing: true,
  tolerancePx: DEFAULT_TOLERANCE_PX,
  scaleContents: false
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Math.round(value)))

/**
 * The step a board wants when the author has named none. A dashboard on a small
 * panel is built out of small boxes, and a step of eight pixels there is a
 * twentieth of the display — coarse enough to be in the way rather than in
 * help.
 */
export function defaultGridSize(display: { width: number; height: number }): number {
  return Math.min(display.width, display.height) <= 480 ? 4 : 8
}

export function resolveGridSize(
  settings: SnapSettings,
  display: { width: number; height: number } | undefined
): number {
  if (settings.gridSize !== undefined) return settings.gridSize
  return display ? defaultGridSize(display) : 8
}

function restore(): SnapSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const stored = JSON.parse(raw) as Partial<SnapSettings>
    return {
      snapToGrid: stored.snapToGrid ?? DEFAULTS.snapToGrid,
      gridSize:
        stored.gridSize === undefined
          ? undefined
          : clamp(stored.gridSize, MINIMUM_GRID_PX, MAXIMUM_GRID_PX),
      snapToWidgets: stored.snapToWidgets ?? DEFAULTS.snapToWidgets,
      snapToSpacing: stored.snapToSpacing ?? DEFAULTS.snapToSpacing,
      tolerancePx: clamp(
        stored.tolerancePx ?? DEFAULTS.tolerancePx,
        MINIMUM_TOLERANCE_PX,
        MAXIMUM_TOLERANCE_PX
      ),
      scaleContents: stored.scaleContents ?? DEFAULTS.scaleContents
    }
  } catch {
    // Storage that cannot be read or parsed is storage the editor does without.
    return DEFAULTS
  }
}

export const useSnapStore = create<SnapStore>((set) => ({
  ...restore(),
  setSnap: (patch) =>
    set((current) => ({
      ...current,
      ...patch,
      ...(patch.gridSize === undefined
        ? {}
        : { gridSize: clamp(patch.gridSize, MINIMUM_GRID_PX, MAXIMUM_GRID_PX) }),
      ...(patch.tolerancePx === undefined
        ? {}
        : {
            tolerancePx: clamp(patch.tolerancePx, MINIMUM_TOLERANCE_PX, MAXIMUM_TOLERANCE_PX)
          })
    })),
  toggleScaleContents: () => set((current) => ({ scaleContents: !current.scaleContents }))
}))

useSnapStore.subscribe((state) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snapToGrid: state.snapToGrid,
        gridSize: state.gridSize,
        snapToWidgets: state.snapToWidgets,
        snapToSpacing: state.snapToSpacing,
        tolerancePx: state.tolerancePx,
        scaleContents: state.scaleContents
      })
    )
  } catch {
    // Writing is a convenience; a full or blocked store must not break editing.
  }
})
