// What crossed the serial link, and what the application did about it.
//
// This used to be development-only — every write returned early outside a dev
// build. The debug workspace ships now, because a board that misbehaves in a
// release build is exactly when someone needs to see the traffic; what keeps it
// affordable is the bound below rather than the build flag.

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

// The log is a window on the session, not a record of it: an idle board still
// answers a probe, and a save streams a font package a kilobyte at a time.
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
