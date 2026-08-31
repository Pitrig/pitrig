import { create } from 'zustand'

const STORAGE_KEY = 'simcore.editor.snap'

export const MINIMUM_GRID_PX = 1
export const MAXIMUM_GRID_PX = 64
export const MINIMUM_TOLERANCE_PX = 1
export const MAXIMUM_TOLERANCE_PX = 32
const DEFAULT_TOLERANCE_PX = 10

export interface SnapSettings {
  snapToGrid: boolean
  gridSize?: number
  snapToWidgets: boolean
  snapToSpacing: boolean
  tolerancePx: number
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

function defaultGridSize(display: { width: number; height: number }): number {
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
  }
})
