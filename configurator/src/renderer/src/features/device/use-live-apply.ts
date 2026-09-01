import { useEffect, useRef } from 'react'

import { configurationsEqual } from '@shared/configuration-access'
import { documentsDiffering } from '@shared/configuration-documents'
import type { DeviceConfiguration } from '@shared/device'
import { formatConfiguration, useDeviceStore } from './device-store'

const APPLY_DELAY_MS = 250
const BUSY_RETRY_DELAY_MS = 750
const BUSY_RETRIES = 5

export interface LiveApplyState {
  pending: boolean
  error?: string
}

export function recordRunningConfiguration(configuration: DeviceConfiguration | undefined): void {
  const store = useDeviceStore.getState()
  if (configuration) store.markLiveApplied(configuration)
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
    if (!enabled || !draft || configurationsEqual(draft, running)) return
    let cancelled = false
    let attempts = 0

    const send = async (configuration: DeviceConfiguration): Promise<void> => {
      const changed = documentsDiffering(configuration, running)
      if (changed.length === 0) {
        recordRunningConfiguration(configuration)
        return
      }
      inFlight.current = true
      report.current({ pending: true })
      const result = await window.simcore.applyDeviceConfiguration({
        json: formatConfiguration(configuration),
        documents: changed
      })
      inFlight.current = false
      recordRunningConfiguration(result.ok ? configuration : undefined)
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
      queued.current = undefined
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
