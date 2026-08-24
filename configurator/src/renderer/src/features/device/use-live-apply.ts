import { useEffect, useRef } from 'react'

import { configurationsEqual } from '@shared/configuration-access'
import { documentsDiffering } from '@shared/configuration-documents'
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
 *
 * Only the documents that actually moved are sent. In practice that is the
 * dashboard alone, which is the difference between a widget drag costing its own
 * bytes and costing the whole configuration; and an edit confined to the
 * protocol document sends nothing at all, since the transport cannot be applied
 * to a running board.
 */
export function useLiveApply(enabled: boolean, onState: (state: LiveApplyState) => void): void {
  const draft = useDeviceStore((state) => state.draft)
  // What the board is rendering right now, which is what it loaded at startup.
  // `pendingConfiguration` is deliberately not consulted: that is what a
  // restart would bring up, not what is on the screen.
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
    // A freshly connected board is already showing its own configuration, so
    // that is where "what the board is showing" starts. Left unset, the first
    // pass would count every document as changed and apply all of them — and
    // applying the modules document rebuilds the dashboard whole rather than in
    // place, so connecting to a board that was perfectly correct redrew its
    // screen. A draft that genuinely differs still travels, one document at a
    // time, exactly as an edit does.
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
        // What the board is now showing, which is the whole draft: the documents
        // that were not sent are the ones it already had.
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
