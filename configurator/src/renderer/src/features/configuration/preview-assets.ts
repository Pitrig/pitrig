import { create } from 'zustand'

import {
  NO_PREVIEW_ASSETS,
  type PreviewAssets,
  type PreviewImageAsset
} from '../../../../shared/preview-assets'

/**
 * The uploaded assets the canvas draws with. The board rasterizes a face and
 * holds a bitmap it never sends back, so these come from the configurator's own
 * copy of what it installed; without one the preview falls back to a stand-in
 * system font and a named box, which is what it did before the cache existed.
 */
interface PreviewAssetState {
  /** Families whose face is installed in the document and ready to draw with. */
  fonts: Readonly<Record<string, boolean>>
  images: Readonly<Record<string, PreviewImageAsset>>
  refresh: () => Promise<void>
}

/** The CSS family one uploaded family is registered under. */
export function previewFontFamily(family: string): string {
  return `simcore-asset-${family}`
}

// Registered faces are document state rather than store state: the store says
// which families are usable, and this keeps the handles needed to withdraw the
// ones a later upload replaced.
const registered = new Map<string, FontFace>()

async function registerFonts(assets: PreviewAssets): Promise<Record<string, boolean>> {
  const loaded: Record<string, boolean> = {}
  const wanted = new Set(assets.fonts.map((font) => font.family))
  for (const [family, face] of registered) {
    if (wanted.has(family)) continue
    document.fonts.delete(face)
    registered.delete(family)
  }
  for (const font of assets.fonts) {
    try {
      const previous = registered.get(font.family)
      if (previous) {
        document.fonts.delete(previous)
        registered.delete(font.family)
      }
      // Copied into a plain buffer: the bytes arrive over IPC, and FontFace
      // takes ownership of what it is handed.
      const source = new Uint8Array(font.bytes).slice().buffer
      const face = new FontFace(previewFontFamily(font.family), source)
      await face.load()
      document.fonts.add(face)
      registered.set(font.family, face)
      loaded[font.family] = true
    } catch {
      // A face the browser cannot parse is one the canvas draws without. The
      // board may still hold it, so this is a preview limitation, not an error
      // the author has to act on.
    }
  }
  return loaded
}

export const usePreviewAssetStore = create<PreviewAssetState>((set) => ({
  fonts: {},
  images: {},
  refresh: async () => {
    const assets = (await window.simcore.readPreviewAssets().catch(() => NO_PREVIEW_ASSETS)) ??
      NO_PREVIEW_ASSETS
    const fonts = await registerFonts(assets)
    set({
      fonts,
      images: Object.fromEntries(assets.images.map((image) => [image.name, image]))
    })
  }
}))
