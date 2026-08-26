export interface DebugLogEntry {
  id: number
  timestamp: Date
  message: string
  data?: unknown
}

export interface DebugLogSnapshot {
  entries: DebugLogEntry[]
  omittedEntryCount: number
}

const MAXIMUM_LOG_ENTRIES = 2_000

let nextEntryId = 1
let snapshot: DebugLogSnapshot = { entries: [], omittedEntryCount: 0 }
const listeners = new Set<() => void>()

export function writeDebugLog(message: string, data?: unknown): void {
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

export function clearDebugLog(): void {
  snapshot = { entries: [], omittedEntryCount: 0 }
  for (const listener of listeners) {
    listener()
  }
}

export function getDebugLogSnapshot(): DebugLogSnapshot {
  return snapshot
}

export function subscribeToDebugLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
