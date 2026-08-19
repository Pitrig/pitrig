import { create } from 'zustand'

import type { FontCatalogFamily, FontVariant } from '@shared/font-library'

import { catalogFontFamily, registerCatalogFace } from './font-face-store'

/**
 * The Google Fonts catalog as the picker browses it.
 *
 * Rows draw themselves in their own face, which means downloading faces the
 * author may never choose — so a row fetches only once it has been on screen
 * long enough to look at, and only a few at a time. A row whose face never
 * arrives reads in the stand-in and says so; it is still choosable.
 */
const MAXIMUM_CONCURRENT_PREVIEWS = 4

type PreviewState = 'loading' | 'ready' | 'unavailable'

interface FontCatalogState {
  families: FontCatalogFamily[]
  loaded: boolean
  /** Per family name, so a row can show what happened to its preview. */
  previews: Readonly<Record<string, PreviewState>>
  /** The library id each previewed family was registered under. */
  previewIds: Readonly<Record<string, string>>
  /** Whether each previewed family's digits are all one width. */
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
    const families = await window.simcore.listFontCatalog().catch(() => [])
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
  const result = await window.simcore.previewFontCatalogFace({ family }).catch(() => undefined)
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

/** The CSS family a previewed catalog row draws in, or undefined until it has one. */
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

/** How a weight reads to a person, rather than as the number the id carries. */
export function variantLabel(variant: FontVariant): string {
  const italic = variant.endsWith('italic')
  const weight = italic ? variant.slice(0, -'italic'.length) : variant
  return `${WEIGHT_NAMES[weight] ?? weight}${italic ? ' Italic' : ''}`
}
