import { useEffect, useRef } from 'react'

import { documentsDiffering } from '@shared/configuration-documents'
import {
  CONFIGURATION_DOCUMENTS,
  CONFIGURATION_DOCUMENT_IDS,
  type ConfigurationDocumentId
} from '@shared/configuration-schema'
import type { DeviceConfiguration, DeviceErrorCode } from '@shared/device'
import { formatConfiguration, useDeviceStore } from './device-store'

const APPLY_DELAY_MS = 250
const BUSY_RETRY_DELAY_MS = 750
const BUSY_RETRIES = 5

const LIVE_DOCUMENTS = CONFIGURATION_DOCUMENT_IDS.filter(
  (id) => !CONFIGURATION_DOCUMENTS[id].rebootRequired
)
const LIVE_SECTIONS = LIVE_DOCUMENTS.flatMap((id) => CONFIGURATION_DOCUMENTS[id].sections)
const RUNNING_HELD: DeviceErrorCode[] = ['busy', 'configuration_rejected']

export interface LiveApplyState {
  pending: boolean
  error?: string
}

export function recordRunningConfiguration(
  configuration: DeviceConfiguration | undefined,
  documents?: readonly ConfigurationDocumentId[]
): void {
  const store = useDeviceStore.getState()
  if (configuration) store.markLiveApplied(configuration, documents)
  else store.markRunningUnknown()
}

export function useLiveApply(enabled: boolean, onState: (state: LiveApplyState) => void): void {
  const draft = useDeviceStore((state) => state.draft)
  const running = useDeviceStore((state) => state.runningConfiguration)
  const inFlight = useRef(false)
  const queued = useRef<DeviceConfiguration | undefined>(undefined)
  const report = useRef(onState)
  useEffect(() => {
    report.current = onState
  })

  useEffect(() => {
    if (!enabled || !draft || liveSectionsEqual(draft, running)) return
    let cancelled = false
    let attempts = 0

    const send = async (configuration: DeviceConfiguration): Promise<void> => {
      queued.current = undefined
      const changed = liveDocumentsDiffering(configuration)
      if (changed.length === 0) return
      inFlight.current = true
      report.current({ pending: true })
      const result = await window.pitrig.applyDeviceConfiguration({
        json: formatConfiguration(configuration),
        documents: changed
      })
      inFlight.current = false
      if (result.ok) recordRunningConfiguration(configuration, result.value.documents)
      else if (!RUNNING_HELD.includes(result.error.code)) recordRunningConfiguration(undefined)
      report.current({
        pending: false,
        error: result.ok || cancelled ? undefined : result.error.message
      })
      if (cancelled) return
      if (!result.ok && result.error.code === 'busy' && ++attempts <= BUSY_RETRIES) {
        window.setTimeout(() => {
          if (!cancelled && !inFlight.current) void send(configuration)
        }, BUSY_RETRY_DELAY_MS)
        return
      }
      const next = queued.current
      if (next) void send(next)
    }

    const timer = window.setTimeout(() => {
      if (inFlight.current) {
        queued.current = draft
        return
      }
      void send(draft)
    }, APPLY_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft, enabled, running])
}

function liveDocumentsDiffering(
  configuration: DeviceConfiguration
): ConfigurationDocumentId[] {
  const changed = documentsDiffering(
    configuration,
    useDeviceStore.getState().runningConfiguration
  )
  return LIVE_DOCUMENTS.filter((id) => changed.includes(id))
}

function liveSectionsEqual(
  draft: DeviceConfiguration,
  running: DeviceConfiguration | undefined
): boolean {
  if (!running || draft.board !== running.board) return false
  const left = draft as unknown as Record<string, unknown>
  const right = running as unknown as Record<string, unknown>
  return LIVE_SECTIONS.every((section) => left[section] === right[section])
}
