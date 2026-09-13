import { ipcMain } from 'electron'

import { TelemetryBridgeService } from './bridge-service'
import type { DeviceService } from '../device/device-service'
import { broadcastToWindows } from '../ipc/broadcast'
import { isTelemetryBridgeStartRequest } from '../ipc/request-guards'
import type { DeviceResult } from '../../shared/device'
import {
  TELEMETRY_BRIDGE_SNAPSHOT_CHANNEL,
  TELEMETRY_BRIDGE_START_CHANNEL,
  TELEMETRY_BRIDGE_STATUS_CHANGED_CHANNEL,
  TELEMETRY_BRIDGE_STATUS_CHANNEL,
  TELEMETRY_BRIDGE_STOP_CHANNEL,
  type TelemetryBridgeStatus
} from '../../shared/telemetry-bridge'

export function registerTelemetryBridge(deviceService: DeviceService): TelemetryBridgeService {
  const service = new TelemetryBridgeService(
    deviceService,
    (status) => broadcastToWindows(TELEMETRY_BRIDGE_STATUS_CHANGED_CHANNEL, status),
    (snapshot) => broadcastToWindows(TELEMETRY_BRIDGE_SNAPSHOT_CHANNEL, snapshot)
  )
  ipcMain.handle(TELEMETRY_BRIDGE_STATUS_CHANNEL, () => service.getStatus())
  ipcMain.handle(TELEMETRY_BRIDGE_STOP_CHANNEL, () => service.stop())
  ipcMain.handle(TELEMETRY_BRIDGE_START_CHANNEL, (_event, request: unknown) => {
    if (!isTelemetryBridgeStartRequest(request)) {
      const result: DeviceResult<TelemetryBridgeStatus> = {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'Invalid telemetry bridge request.'
        }
      }
      return result
    }
    return service.start(request)
  })
  return service
}
