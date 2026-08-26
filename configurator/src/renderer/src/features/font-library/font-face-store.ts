import { create } from 'zustand'

interface FontFaceState {
  loaded: Readonly<Record<string, boolean>>
  ensureFaces: (ids: readonly string[]) => Promise<void>
  invalidate: () => Promise<void>
}

export function catalogFontFamily(id: string): string {
  return `simcore-catalog-${id}`
}

export async function registerCatalogFace(id: string, bytes: Uint8Array): Promise<boolean> {
  return register(catalogFontFamily(id), `catalog:${id}`, bytes)
}

export function previewFontFamily(id: string): string {
  return `simcore-asset-${id}`
}

const registered = new Map<string, FontFace>()

async function register(cssFamily: string, key: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const previous = registered.get(key)
    if (previous) {
      document.fonts.delete(previous)
      registered.delete(key)
    }
    const source = new Uint8Array(bytes).slice().buffer
    const face = new FontFace(cssFamily, source)
    await face.load()
    document.fonts.add(face)
    registered.set(key, face)
    return true
  } catch {
    return false
  }
}

function withdrawAll(): void {
  for (const face of registered.values()) document.fonts.delete(face)
  registered.clear()
}

export const useFontFaceStore = create<FontFaceState>((set, get) => ({
  loaded: {},
  ensureFaces: async (ids) => {
    const { loaded } = get()
    const wanted = [...new Set(ids)].filter((id) => id && !loaded[id])
    if (wanted.length === 0) return
    const faces = await window.simcore.readFontFaces({ ids: wanted }).catch(() => [])
    const added: Record<string, boolean> = {}
    for (const face of faces) {
      if (await register(previewFontFamily(face.id), face.id, face.bytes)) added[face.id] = true
    }
    if (Object.keys(added).length === 0) return
    set((state) => ({ loaded: { ...state.loaded, ...added } }))
  },
  invalidate: async () => {
    withdrawAll()
    set({ loaded: {} })
  }
}))
