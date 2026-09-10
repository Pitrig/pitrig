import { create } from 'zustand'
import { ICON_FAMILY, ICON_GLYPHS } from '@shared/icon-glyphs'
import { iconLigatures, type IconName } from './icon-ligatures'

interface IconCatalogState {
  icons: readonly IconName[]
  loading: boolean
  load: () => Promise<void>
}

export const useIconCatalogStore = create<IconCatalogState>((set, get) => ({
  icons: [],
  loading: false,
  load: async () => {
    if (get().loading || get().icons.length > 0) return
    set({ loading: true })
    const faces = await window.pitrig.readFontFaces({ ids: [ICON_FAMILY] }).catch(() => [])
    const face = faces.find((candidate) => candidate.id === ICON_FAMILY)
    set({ loading: false, icons: face ? iconLigatures(face.bytes) : [] })
  }
}))

export function searchIcons(icons: readonly IconName[], query: string): IconName[] {
  const words = query.toLowerCase().replace(/_/g, ' ').split(' ').filter(Boolean)
  const matching = (icon: IconName): boolean => words.every((word) => icon.name.includes(word))
  const leading = (icon: IconName): boolean => icon.name.startsWith(words[0] ?? '')
  const found = icons.filter(matching)
  const ordered = [
    ...ICON_GLYPHS.filter(matching),
    ...found.filter(leading),
    ...found.filter((icon) => !leading(icon))
  ]
  const seen = new Set<string>()
  return ordered.filter((icon) => {
    if (seen.has(icon.glyph)) return false
    seen.add(icon.glyph)
    return true
  })
}
