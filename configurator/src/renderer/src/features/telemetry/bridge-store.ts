import { create } from 'zustand'

import type { TelemetryBridgeApi } from '@shared/ipc'
import {
  idleBridgeStatus,
  type TelemetryBridgeStartRequest,
  type TelemetryBridgeStatus
} from '@shared/telemetry-bridge'

interface BridgeState {
  status: TelemetryBridgeStatus
  busy: boolean
}

export const useBridgeStore = create<BridgeState>(() => ({
  status: idleBridgeStatus(),
  busy: false
}))

export function telemetryBridge(): TelemetryBridgeApi {
  const bridge = window.pitrig.telemetryBridge
  if (!bridge) throw new Error('This build does not include the telemetry bridge.')
  return bridge
}

export function subscribeToTelemetryBridge(): () => void {
  const bridge = telemetryBridge()
  void bridge.getStatus().then((status) => useBridgeStore.setState({ status }))
  return bridge.onStatus((status) => useBridgeStore.setState({ status }))
}

export async function startTelemetryBridge(
  request: TelemetryBridgeStartRequest
): Promise<string | undefined> {
  useBridgeStore.setState({ busy: true })
  try {
    const result = await telemetryBridge().start(request)
    if (!result.ok) return result.error.message
    useBridgeStore.setState({ status: result.value })
    return undefined
  } finally {
    useBridgeStore.setState({ busy: false })
  }
}

export async function stopTelemetryBridge(): Promise<void> {
  useBridgeStore.setState({ busy: true })
  try {
    const result = await telemetryBridge().stop()
    if (result.ok) useBridgeStore.setState({ status: result.value })
  } finally {
    useBridgeStore.setState({ busy: false })
  }
}
