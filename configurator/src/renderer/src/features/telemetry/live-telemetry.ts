import { useSyncExternalStore } from 'react'

import {
  emptySnapshot,
  slotOfName,
  valueOfSlot,
  type TelemetrySnapshot
} from '@shared/telemetry-bridge'
import { UNAVAILABLE, type TelemetryValue } from '@shared/telemetry-value'

const SLOW_INTERVAL_MS = 100

let table: TelemetrySnapshot = emptySnapshot()
let live = false
let frameRevision = 0
let slowRevision = 0
let framePending = false

const frameListeners = new Set<() => void>()
const slowListeners = new Set<() => void>()

function notify(listeners: ReadonlySet<() => void>): void {
  for (const listener of listeners) listener()
}

function onFrame(): void {
  framePending = false
  frameRevision += 1
  notify(frameListeners)
}

function receive(snapshot: TelemetrySnapshot): void {
  table = snapshot
  live = true
  if (framePending) return
  framePending = true
  requestAnimationFrame(onFrame)
}

function clear(): void {
  if (!live) return
  live = false
  table = emptySnapshot()
  frameRevision += 1
  notify(frameListeners)
}

export function startLiveTelemetry(): () => void {
  const stopSnapshots = window.pitrig.onTelemetrySnapshot(receive)
  const stopStatus = window.pitrig.onTelemetryBridgeStatus((status) => {
    if (!status.running) clear()
  })
  const slowTimer = window.setInterval(() => {
    slowRevision += 1
    notify(slowListeners)
  }, SLOW_INTERVAL_MS)
  return () => {
    stopSnapshots()
    stopStatus()
    window.clearInterval(slowTimer)
  }
}

export function useLiveRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      frameListeners.add(listener)
      return () => frameListeners.delete(listener)
    },
    () => frameRevision
  )
}

export function useSlowRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      slowListeners.add(listener)
      return () => slowListeners.delete(listener)
    },
    () => slowRevision
  )
}

export function telemetryIsLive(): boolean {
  return live
}

export function liveSlotValue(slot: number): TelemetryValue {
  if (!live) return UNAVAILABLE
  return valueOfSlot(table, slot)
}

export function readLiveValue(binding: string | undefined): TelemetryValue {
  if (!live || binding === undefined) return UNAVAILABLE
  const slot = slotOfName(binding)
  return slot === undefined ? UNAVAILABLE : valueOfSlot(table, slot)
}

export function liveElapsedMs(): number {
  return performance.now()
}
