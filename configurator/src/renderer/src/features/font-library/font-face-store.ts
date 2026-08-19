import { create } from 'zustand'

/**
 * The faces the canvas can actually draw with, registered with the document so
 * CSS and the measuring canvas both see them.
 *
 * These come from the configurator's font library rather than from anything a
 * board reported: a family identifier names a library entry, so a dashboard
 * draws in its real face before it has ever been connected to a device, and
 * keeps doing so on another machine. A family the library cannot answer for is
 * the one case that still falls back to a stand-in, and it is exactly the case
 * the unresolved-font flow exists to fix.
 */
interface FontFaceState {
  /** Library ids whose face is registered and ready to draw with. */
  loaded: Readonly<Record<string, boolean>>
  /** Registers any of these ids not already registered. Safe to call often. */
  ensureFaces: (ids: readonly string[]) => Promise<void>
  /** Drops every registration, so the next ensure re-reads the library. */
  invalidate: () => Promise<void>
}

/**
 * The CSS family a catalog row's face is registered under, kept apart from the
 * library's so choosing a row does not silently repoint a widget that already
 * draws in a library face of the same id.
 */
export function catalogFontFamily(id: string): string {
  return `simcore-catalog-${id}`
}

/** Registers a browsed catalog face for a picker row. */
export async function registerCatalogFace(id: string, bytes: Uint8Array): Promise<boolean> {
  return register(catalogFontFamily(id), `catalog:${id}`, bytes)
}

/** The CSS family one library face is registered under. */
export function previewFontFamily(id: string): string {
  return `simcore-asset-${id}`
}

// Registered faces are document state rather than store state: the store says
// which ids are usable, and this keeps the handles needed to withdraw the ones
// a later import replaced.
const registered = new Map<string, FontFace>()

async function register(cssFamily: string, key: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const previous = registered.get(key)
    if (previous) {
      document.fonts.delete(previous)
      registered.delete(key)
    }
    // Copied into a plain buffer: the bytes arrive over IPC, and FontFace takes
    // ownership of what it is handed.
    const source = new Uint8Array(bytes).slice().buffer
    const face = new FontFace(cssFamily, source)
    await face.load()
    document.fonts.add(face)
    registered.set(key, face)
    return true
  } catch {
    // A face the browser cannot parse is one the canvas draws without. The
    // board may still take it, so this costs the preview its fidelity rather
    // than being an error the author has to act on.
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
