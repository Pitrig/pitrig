import { useEffect, useRef } from 'react'

import { configurationsEqual } from '@shared/configuration-access'
import { documentsDiffering } from '@shared/configuration-documents'
import type { DeviceConfiguration } from '@shared/device'
import { formatConfiguration, useDeviceStore } from './device-store'

const APPLY_DELAY_MS = 250

export interface LiveApplyState {
  pending: boolean
  error?: string
}

export function useLiveApply(enabled: boolean, onState: (state: LiveApplyState) => void): void {
  const draft = useDeviceStore((state) => state.draft)
  const running = useDeviceStore((state) => state.activeConfiguration)
  const inFlight = useRef(false)
  const queued = useRef<DeviceConfiguration | undefined>(undefined)
  const applied = useRef<DeviceConfiguration | undefined>(undefined)
  const report = useRef(onState)
  useEffect(() => {
    report.current = onState
  })

  useEffect(() => {
    if (!enabled) {
      applied.current = undefined
      return
    }
    applied.current ??= running
    if (!draft || configurationsEqual(draft, applied.current)) return

    const send = async (configuration: DeviceConfiguration): Promise<void> => {
      const changed = documentsDiffering(configuration, applied.current)
      if (changed.length === 0) {
        applied.current = configuration
        return
      }
      inFlight.current = true
      report.current({ pending: true })
      const result = await window.simcore.applyDeviceConfiguration({
        json: formatConfiguration(configuration),
        documents: changed
      })
      inFlight.current = false
      if (result.ok) {
        applied.current = configuration
        report.current({ pending: false })
      } else {
        report.current({ pending: false, error: result.error.message })
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
    return () => window.clearTimeout(timer)
  }, [draft, enabled, running])
}
