export interface EventLogEntry {
  id: number
  timestamp: Date
  message: string
  data?: unknown
}

export interface EventLogSnapshot {
  entries: EventLogEntry[]
  omittedEntryCount: number
}

const MAXIMUM_LOG_ENTRIES = 2_000

let nextEntryId = 1
let snapshot: EventLogSnapshot = { entries: [], omittedEntryCount: 0 }
const listeners = new Set<() => void>()

export function writeEventLog(message: string, data?: unknown): void {
  writeEventLogBatch([{ message, ...(data === undefined ? {} : { data }) }])
}

export function writeEventLogBatch(
  items: readonly { message: string; data?: unknown }[]
): void {
  if (items.length === 0) return
  const timestamp = new Date()
  const entries = [
    ...snapshot.entries,
    ...items.map((item) => ({
      id: nextEntryId++,
      timestamp,
      message: item.message,
      ...(item.data === undefined ? {} : { data: item.data })
    }))
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

export function clearEventLog(): void {
  snapshot = { entries: [], omittedEntryCount: 0 }
  for (const listener of listeners) {
    listener()
  }
}

export function getEventLogSnapshot(): EventLogSnapshot {
  return snapshot
}

export function subscribeToEventLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
