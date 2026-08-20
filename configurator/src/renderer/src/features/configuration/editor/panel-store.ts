import { create } from 'zustand'

import type { LayoutFit } from '@shared/layout-transfer'

/**
 * How the editor's panels are sized, and which property groups are folded.
 *
 * None of it belongs in the dashboard editor store beside it: that one is keyed
 * by the widgets of the document being edited and is thrown away with it, while
 * this describes the window and outlives every document. It is also the one
 * piece of editor state worth keeping across restarts — a panel that forgets its
 * width each launch is a panel that gets resized each launch.
 */

const STORAGE_KEY = 'simcore.editor.panels'

export const MINIMUM_INSPECTOR_WIDTH_PX = 288
export const MAXIMUM_INSPECTOR_WIDTH_PX = 560
export const DEFAULT_INSPECTOR_WIDTH_PX = 352

export const MINIMUM_LAYERS_HEIGHT_PX = 120
export const MAXIMUM_LAYERS_HEIGHT_PX = 720
export const DEFAULT_LAYERS_HEIGHT_PX = 260

interface PersistedPanels {
  inspectorWidth: number
  layersHeight: number
  /**
   * How a layout is scaled when it moves to another display. It is a
   * preference rather than a property of any one transfer: the same author
   * tends to want the same answer every time, and the choice is now offered in
   * three places — the Configs page, the canvas board picker and the template
   * library — which would otherwise disagree about what was last chosen.
   */
  transferFit: LayoutFit
  /**
   * Explicit fold state by group key, global rather than per widget: folding
   * "Box" means the author is done with boxes, not done with this arc. A key
   * that is absent leaves the group to decide for itself, which is what lets an
   * empty optional group arrive folded and a filled one arrive open.
   */
  groups: Record<string, boolean>
}

interface EditorPanelStore extends PersistedPanels {
  setInspectorWidth: (px: number) => void
  setLayersHeight: (px: number) => void
  setTransferFit: (fit: LayoutFit) => void
  setGroupOpen: (key: string, open: boolean) => void
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Math.round(value)))

const DEFAULTS: PersistedPanels = {
  inspectorWidth: DEFAULT_INSPECTOR_WIDTH_PX,
  layersHeight: DEFAULT_LAYERS_HEIGHT_PX,
  transferFit: 'contain',
  groups: {}
}

function restore(): PersistedPanels {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const stored = JSON.parse(raw) as Partial<PersistedPanels>
    return {
      inspectorWidth: clamp(
        stored.inspectorWidth ?? DEFAULTS.inspectorWidth,
        MINIMUM_INSPECTOR_WIDTH_PX,
        MAXIMUM_INSPECTOR_WIDTH_PX
      ),
      layersHeight: clamp(
        stored.layersHeight ?? DEFAULTS.layersHeight,
        MINIMUM_LAYERS_HEIGHT_PX,
        MAXIMUM_LAYERS_HEIGHT_PX
      ),
      transferFit: stored.transferFit === 'stretch' ? 'stretch' : DEFAULTS.transferFit,
      groups: stored.groups ?? {}
    }
  } catch {
    // Storage that cannot be read or parsed is storage the editor does without.
    return DEFAULTS
  }
}

export const useEditorPanelStore = create<EditorPanelStore>((set) => ({
  ...restore(),
  setInspectorWidth: (px) =>
    set({ inspectorWidth: clamp(px, MINIMUM_INSPECTOR_WIDTH_PX, MAXIMUM_INSPECTOR_WIDTH_PX) }),
  setLayersHeight: (px) =>
    set({ layersHeight: clamp(px, MINIMUM_LAYERS_HEIGHT_PX, MAXIMUM_LAYERS_HEIGHT_PX) }),
  setTransferFit: (transferFit) => set({ transferFit }),
  setGroupOpen: (key, open) => set((current) => ({ groups: { ...current.groups, [key]: open } }))
}))

useEditorPanelStore.subscribe(({ inspectorWidth, layersHeight, transferFit, groups }) => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ inspectorWidth, layersHeight, transferFit, groups })
    )
  } catch {
    // Writing is a convenience; a full or blocked store must not break editing.
  }
})
