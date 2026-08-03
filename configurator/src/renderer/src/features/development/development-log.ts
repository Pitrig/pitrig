export interface DevelopmentLogEntry {
  id: number
  timestamp: Date
  message: string
  data?: unknown
}

let nextEntryId = 1
let entries: DevelopmentLogEntry[] = []
const listeners = new Set<() => void>()

export function writeDevelopmentLog(message: string, data?: unknown): void {
  if (!import.meta.env.DEV) {
    return
  }

  entries = [
    ...entries,
    {
      id: nextEntryId++,
      timestamp: new Date(),
      message,
      ...(data === undefined ? {} : { data })
    }
  ]
  for (const listener of listeners) {
    listener()
  }
}

export function clearDevelopmentLog(): void {
  entries = []
  for (const listener of listeners) {
    listener()
  }
}

export function getDevelopmentLog(): DevelopmentLogEntry[] {
  return entries
}

export function subscribeToDevelopmentLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
