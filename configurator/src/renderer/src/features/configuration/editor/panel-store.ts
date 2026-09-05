import { create } from 'zustand'

import type { LayoutFit } from '@shared/layout-transfer'

const STORAGE_KEY = 'pitrig.editor.panels'

const MINIMUM_INSPECTOR_WIDTH_PX = 288
const MAXIMUM_INSPECTOR_WIDTH_PX = 560
const DEFAULT_INSPECTOR_WIDTH_PX = 352

const MINIMUM_LAYERS_HEIGHT_PX = 120
const MAXIMUM_LAYERS_HEIGHT_PX = 720
const DEFAULT_LAYERS_HEIGHT_PX = 260

export type TemplateSort = 'size' | 'name'

interface PersistedPanels {
  inspectorWidth: number
  layersHeight: number
  transferFit: LayoutFit
  templateSort: TemplateSort
  templateBoard: string
  groups: Record<string, boolean>
}

interface EditorPanelStore extends PersistedPanels {
  setInspectorWidth: (px: number) => void
  setLayersHeight: (px: number) => void
  setTransferFit: (fit: LayoutFit) => void
  setTemplateSort: (sort: TemplateSort) => void
  setTemplateBoard: (board: string) => void
  setGroupOpen: (key: string, open: boolean) => void
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Math.round(value)))

const DEFAULTS: PersistedPanels = {
  inspectorWidth: DEFAULT_INSPECTOR_WIDTH_PX,
  layersHeight: DEFAULT_LAYERS_HEIGHT_PX,
  transferFit: 'contain',
  templateSort: 'size',
  templateBoard: '',
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
      templateSort: stored.templateSort === 'name' ? 'name' : DEFAULTS.templateSort,
      templateBoard:
        typeof stored.templateBoard === 'string' ? stored.templateBoard : DEFAULTS.templateBoard,
      groups: stored.groups ?? {}
    }
  } catch {
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
  setTemplateSort: (templateSort) => set({ templateSort }),
  setTemplateBoard: (templateBoard) => set({ templateBoard }),
  setGroupOpen: (key, open) => set((current) => ({ groups: { ...current.groups, [key]: open } }))
}))

useEditorPanelStore.subscribe((state) => {
  const { inspectorWidth, layersHeight, transferFit, templateSort, templateBoard, groups } = state
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        inspectorWidth,
        layersHeight,
        transferFit,
        templateSort,
        templateBoard,
        groups
      })
    )
  } catch {
  }
})
