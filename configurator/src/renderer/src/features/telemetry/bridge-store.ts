import { create } from 'zustand'

import type { TelemetryBridgeApi } from '@shared/ipc'
import {
  LINK_DEFAULT_PORT,
  LINK_DEFAULT_SIMHUB_HOST,
  LINK_SOURCE_PORT,
  idleBridgeStatus,
  type TelemetryBridgeStartRequest,
  type TelemetryBridgeStatus
} from '@shared/telemetry-bridge'
import { t } from '@shared/ui-text'

interface BridgeState {
  status: TelemetryBridgeStatus
  busy: boolean
  request: TelemetryBridgeStartRequest
}

export const useBridgeStore = create<BridgeState>(() => ({
  status: idleBridgeStatus(),
  busy: false,
  request: {
    port: LINK_DEFAULT_PORT,
    simhubHost: LINK_DEFAULT_SIMHUB_HOST,
    simhubPort: LINK_SOURCE_PORT
  }
}))

export function setBridgeRequest(change: Partial<TelemetryBridgeStartRequest>): void {
  useBridgeStore.setState((current) => ({ request: { ...current.request, ...change } }))
}

export function telemetryBridge(): TelemetryBridgeApi {
  const bridge = window.pitrig.telemetryBridge
  if (!bridge) throw new Error(t('telemetry.bridgeStore.thisBuildDoesNotInclude'))
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
  useBridgeStore.setState({ busy: true, request })
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
