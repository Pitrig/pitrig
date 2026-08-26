import { create } from 'zustand'

import { fontPackageFootprint, type FontLibraryEntry } from '@shared/font-library'

import { useFontFaceStore } from './font-face-store'

interface FontLibraryState {
  entries: FontLibraryEntry[]
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

export function subscribeToFontLibrary(): () => void {
  void useFontLibraryStore.getState().refresh()
  return window.simcore.onFontLibraryChanged((snapshot) => {
    useFontLibraryStore.setState({
      entries: snapshot.entries,
      unreadable: snapshot.unreadable
    })
    void useFontFaceStore.getState().invalidate()
  })
}

export function findFontEntry(
  entries: readonly FontLibraryEntry[],
  id: string | undefined
): FontLibraryEntry | undefined {
  return id ? entries.find((entry) => entry.id === id) : undefined
}

export function dashboardFontFootprint(
  entries: readonly FontLibraryEntry[],
  families: readonly string[]
): { families: number; bytes: number } {
  const sizes = [...new Set(families)].map((family) => findFontEntry(entries, family)?.bytes ?? 0)
  return fontPackageFootprint(sizes)
}

export function kilobytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`
}
