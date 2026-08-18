import { useEffect, useRef } from 'react'

import { configurationsEqual } from '@shared/configuration-access'
import type { DeviceConfiguration } from '@shared/device'
import { formatConfiguration, useDeviceStore } from './device-store'

// Applying rebuilds the dashboard on the device, so it follows the draft on a
// trailing delay rather than on every edit. Long enough that dragging a widget
// does not restart composition per frame, short enough to read as immediate.
const APPLY_DELAY_MS = 250

export interface LiveApplyState {
  pending: boolean
  error?: string
}

/**
 * Keeps the connected device rendering the current draft without writing flash
 * or restarting. Only one apply is in flight at a time; edits made while one is
 * running are collapsed into a single follow-up, so a burst of edits costs one
 * extra round trip rather than one per edit.
 */
export function useLiveApply(enabled: boolean, onState: (state: LiveApplyState) => void): void {
  const draft = useDeviceStore((state) => state.draft)
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
    if (!draft || configurationsEqual(draft, applied.current)) return

    const send = async (configuration: DeviceConfiguration): Promise<void> => {
      inFlight.current = true
      report.current({ pending: true })
      const result = await window.simcore.applyDeviceConfiguration({
        json: formatConfiguration(configuration)
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
  }, [draft, enabled])
}
