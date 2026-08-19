import { create } from 'zustand'

import { fontPackageFootprint, type FontLibraryEntry } from '@shared/font-library'

import { useFontFaceStore } from './font-face-store'

/**
 * What the configurator's font library holds. It is the picker's list, the
 * preview's source of faces, and what a save resolves a document's families
 * against — one snapshot, refreshed when the main process says it changed.
 */
interface FontLibraryState {
  entries: FontLibraryEntry[]
  /** Entries whose face file has gone missing. A visible gap, not a failure. */
  unreadable: number
  refresh: () => Promise<void>
}

export const useFontLibraryStore = create<FontLibraryState>((set) => ({
  entries: [],
  unreadable: 0,
  refresh: async () => {
    const snapshot = await window.simcore
      .listFontLibrary()
      .catch(() => ({ entries: [], unreadable: 0 }))
    set({ entries: snapshot.entries, unreadable: snapshot.unreadable })
  }
}))

/**
 * Keeps the store in step with the main process. Subscribing here rather than
 * in a component means an import made from the picker updates the library panel
 * and the canvas at once.
 */
export function subscribeToFontLibrary(): () => void {
  void useFontLibraryStore.getState().refresh()
  return window.simcore.onFontLibraryChanged((snapshot) => {
    useFontLibraryStore.setState({
      entries: snapshot.entries,
      unreadable: snapshot.unreadable
    })
    // A replaced face keeps its id, so the registration has to be dropped or
    // the canvas would keep drawing the face that was replaced.
    void useFontFaceStore.getState().invalidate()
  })
}

export function findFontEntry(
  entries: readonly FontLibraryEntry[],
  id: string | undefined
): FontLibraryEntry | undefined {
  return id ? entries.find((entry) => entry.id === id) : undefined
}

/**
 * What the families a dashboard names would cost as an installed package. A
 * family the library cannot answer for counts as a slot with no bytes, which is
 * the honest reading: it is a family the dashboard needs and the package cannot
 * yet carry.
 */
export function dashboardFontFootprint(
  entries: readonly FontLibraryEntry[],
  families: readonly string[]
): { families: number; bytes: number } {
  const sizes = [...new Set(families)].map((family) => findFontEntry(entries, family)?.bytes ?? 0)
  return fontPackageFootprint(sizes)
}

/** Sizes as the budget readouts show them, so the three surfaces agree. */
export function kilobytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`
}
