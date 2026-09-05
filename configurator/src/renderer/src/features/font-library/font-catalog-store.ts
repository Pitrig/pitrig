import { create } from 'zustand'

import type { FontCatalogFamily, FontVariant } from '@shared/font-library'

import { catalogFontFamily, registerCatalogFace } from './font-face-store'

const MAXIMUM_CONCURRENT_PREVIEWS = 4

type PreviewState = 'loading' | 'ready' | 'unavailable'

interface FontCatalogState {
  families: FontCatalogFamily[]
  loaded: boolean
  previews: Readonly<Record<string, PreviewState>>
  previewIds: Readonly<Record<string, string>>
  tabular: Readonly<Record<string, boolean>>
  load: () => Promise<void>
  requestPreview: (family: string) => void
}

let active = 0
const queue: string[] = []

export const useFontCatalogStore = create<FontCatalogState>((set, get) => ({
  families: [],
  loaded: false,
  previews: {},
  previewIds: {},
  tabular: {},
  load: async () => {
    if (get().loaded) return
    const families = await window.pitrig.listFontCatalog().catch(() => [])
    set({ families, loaded: true })
  },
  requestPreview: (family) => {
    if (get().previews[family]) return
    set((state) => ({ previews: { ...state.previews, [family]: 'loading' } }))
    queue.push(family)
    void drain(set)
  }
}))

type SetState = (
  updater: (state: FontCatalogState) => Partial<FontCatalogState>
) => void

async function drain(set: SetState): Promise<void> {
  while (active < MAXIMUM_CONCURRENT_PREVIEWS) {
    const family = queue.shift()
    if (family === undefined) return
    active += 1
    void preview(family, set).finally(() => {
      active -= 1
      void drain(set)
    })
  }
}

async function preview(family: string, set: SetState): Promise<void> {
  const result = await window.pitrig.previewFontCatalogFace({ family }).catch(() => undefined)
  if (!result) {
    set((state) => ({ previews: { ...state.previews, [family]: 'unavailable' } }))
    return
  }
  const registered = await registerCatalogFace(result.id, result.bytes)
  set((state) => ({
    previews: { ...state.previews, [family]: registered ? 'ready' : 'unavailable' },
    previewIds: { ...state.previewIds, [family]: result.id },
    ...(result.tabularDigits === undefined
      ? {}
      : { tabular: { ...state.tabular, [family]: result.tabularDigits } })
  }))
}

export function catalogPreviewFamily(
  previews: Readonly<Record<string, PreviewState>>,
  previewIds: Readonly<Record<string, string>>,
  family: string
): string | undefined {
  const id = previewIds[family]
  return previews[family] === 'ready' && id ? catalogFontFamily(id) : undefined
}

const WEIGHT_NAMES: Readonly<Record<string, string>> = {
  '100': 'Thin',
  '200': 'ExtraLight',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
  '800': 'ExtraBold',
  '900': 'Black'
}

export function variantLabel(variant: FontVariant): string {
  const italic = variant.endsWith('italic')
  const weight = italic ? variant.slice(0, -'italic'.length) : variant
  return `${WEIGHT_NAMES[weight] ?? weight}${italic ? ' Italic' : ''}`
}
