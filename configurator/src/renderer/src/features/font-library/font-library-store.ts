import { create } from 'zustand'

import { fontPackageFootprint, type FontLibraryEntry } from '@shared/font-library'

import { useFontFaceStore } from './font-face-store'

interface FontLibraryState {
  entries: FontLibraryEntry[]
  unreadable: number
  failed: boolean
  refresh: () => Promise<void>
}

export const useFontLibraryStore = create<FontLibraryState>((set) => ({
  entries: [],
  unreadable: 0,
  failed: false,
  refresh: async () => {
    const snapshot = await window.pitrig.listFontLibrary().catch(() => undefined)
    if (!snapshot) {
      set({ failed: true })
      return
    }
    set({ entries: snapshot.entries, unreadable: snapshot.unreadable, failed: false })
  }
}))

function changedFaceIds(
  previous: readonly FontLibraryEntry[],
  next: readonly FontLibraryEntry[]
): string[] {
  const sizes = new Map(next.map((entry) => [entry.id, entry.bytes]))
  return previous
    .filter((entry) => sizes.get(entry.id) !== entry.bytes)
    .map((entry) => entry.id)
}

export function subscribeToFontLibrary(): () => void {
  void useFontLibraryStore.getState().refresh()
  return window.pitrig.onFontLibraryChanged((snapshot) => {
    const previous = useFontLibraryStore.getState().entries
    useFontLibraryStore.setState({
      entries: snapshot.entries,
      unreadable: snapshot.unreadable,
      failed: false
    })
    const changed = changedFaceIds(previous, snapshot.entries)
    if (changed.length === 0) return
    const faces = useFontFaceStore.getState()
    faces.invalidate(changed)
    const present = new Set(snapshot.entries.map((entry) => entry.id))
    void faces.ensureFaces(changed.filter((id) => present.has(id)))
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
