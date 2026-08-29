import { useEffect, useRef } from 'react'
import { create } from 'zustand'

import { documentsDiffering } from '@shared/configuration-documents'
import { CONFIGURATION_DOCUMENT_IDS } from '@shared/configuration-schema'
import type { ConfigurationDocumentId } from '@shared/configuration-schema'
import type { DeviceInfo } from '@shared/device'
import { useDeviceStore } from './device-store'

export type SyncReason = 'connected' | 'board_changed'

export interface SyncQuestion {
  key: string
  reason: SyncReason
  documents: ConfigurationDocumentId[]
  open: boolean
}

interface BoardSyncStore {
  question?: SyncQuestion
  resolvedKey?: string
  ask: (question: Omit<SyncQuestion, 'open'>) => void
  defer: () => void
  reopen: () => void
  resolve: () => void
  dismiss: () => void
  clear: () => void
}

export const useBoardSyncStore = create<BoardSyncStore>((set) => ({
  ask: (question) =>
    set((current) => {
      if (current.resolvedKey === question.key || current.question?.key === question.key) {
        return {}
      }
      return { question: { ...question, open: true } }
    }),
  defer: () =>
    set((current) => (current.question ? { question: { ...current.question, open: false } } : {})),
  reopen: () =>
    set((current) => (current.question ? { question: { ...current.question, open: true } } : {})),
  resolve: () => set((current) => ({ question: undefined, resolvedKey: current.question?.key })),
  dismiss: () => set({ question: undefined }),
  clear: () => set({ question: undefined, resolvedKey: undefined })
}))

export function useBoardSync(dirtyDocuments: ConfigurationDocumentId[]): void {
  const connected = useDeviceStore((state) => state.status === 'connected')
  const revision = useDeviceStore((state) => state.connectionRevision)
  const info = useDeviceStore((state) => state.session?.info)
  const seenRevision = useRef<number | undefined>(undefined)
  const key = `${revision}:${storedKey(info)}`

  useEffect(() => {
    const sync = useBoardSyncStore.getState()
    if (!connected) {
      seenRevision.current = undefined
      sync.clear()
      return
    }
    const reason: SyncReason = seenRevision.current === revision ? 'board_changed' : 'connected'
    seenRevision.current = revision
    const device = useDeviceStore.getState()
    const documents = device.hasLocalDraft
      ? documentsDiffering(device.draft, device.activeConfiguration)
      : []
    if (documents.length === 0) {
      sync.dismiss()
      return
    }
    sync.ask({ key, documents, reason })
  }, [connected, key, revision])

  const question = useBoardSyncStore((state) => state.question)
  useEffect(() => {
    if (question && dirtyDocuments.length === 0) useBoardSyncStore.getState().dismiss()
  }, [dirtyDocuments, question])
}

function storedKey(info: DeviceInfo | undefined): string {
  if (!info) return 'none'
  return CONFIGURATION_DOCUMENT_IDS.map(
    (id) => `${id}=${info.documents[id].outcome}:${info.documents[id].generation}`
  ).join(',')
}
