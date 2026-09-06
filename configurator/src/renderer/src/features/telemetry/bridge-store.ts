import { create } from 'zustand'

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
  status: idleBridgeStatus(false),
  busy: false
}))

export function subscribeToTelemetryBridge(): () => void {
  void window.pitrig
    .getTelemetryBridgeStatus()
    .then((status) => useBridgeStore.setState({ status }))
  return window.pitrig.onTelemetryBridgeStatus((status) => useBridgeStore.setState({ status }))
}

export async function startTelemetryBridge(
  request: TelemetryBridgeStartRequest
): Promise<string | undefined> {
  useBridgeStore.setState({ busy: true })
  try {
    const result = await window.pitrig.startTelemetryBridge(request)
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
    const result = await window.pitrig.stopTelemetryBridge()
    if (result.ok) useBridgeStore.setState({ status: result.value })
  } finally {
    useBridgeStore.setState({ busy: false })
  }
}
