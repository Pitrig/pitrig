export interface DevelopmentLogEntry {
  id: number
  timestamp: Date
  message: string
  data?: unknown
}

export interface DevelopmentLogSnapshot {
  entries: DevelopmentLogEntry[]
  omittedEntryCount: number
}

const MAXIMUM_LOG_ENTRIES = 2_000

let nextEntryId = 1
let snapshot: DevelopmentLogSnapshot = { entries: [], omittedEntryCount: 0 }
const listeners = new Set<() => void>()

export function writeDevelopmentLog(message: string, data?: unknown): void {
  if (!import.meta.env.DEV) {
    return
  }

  const entries = [
    ...snapshot.entries,
    {
      id: nextEntryId++,
      timestamp: new Date(),
      message,
      ...(data === undefined ? {} : { data })
    }
  ]
  const overflow = Math.max(0, entries.length - MAXIMUM_LOG_ENTRIES)
  snapshot = {
    entries: overflow > 0 ? entries.slice(overflow) : entries,
    omittedEntryCount: snapshot.omittedEntryCount + overflow
  }
  for (const listener of listeners) {
    listener()
  }
}

export function clearDevelopmentLog(): void {
  snapshot = { entries: [], omittedEntryCount: 0 }
  for (const listener of listeners) {
    listener()
  }
}

export function getDevelopmentLogSnapshot(): DevelopmentLogSnapshot {
  return snapshot
}

export function subscribeToDevelopmentLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
