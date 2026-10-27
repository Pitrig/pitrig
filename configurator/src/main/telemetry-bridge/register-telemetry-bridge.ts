import { ipcMain } from 'electron'

import { TelemetryBridgeService } from './bridge-service'
import type { DeviceService } from '../device/device-service'
import { broadcastToWindows } from '../ipc/broadcast'
import {
  isTelemetryBridgeStartRequest,
  isTelemetryInterest,
  isTelemetrySimulation
} from '../ipc/request-guards'
import type { DeviceResult } from '../../shared/device'
import {
  LINK_DEFAULT_PORT,
  LINK_DEFAULT_SIMHUB_HOST,
  LINK_SOURCE_PORT,
  TELEMETRY_BRIDGE_INPUT_CHANNEL,
  TELEMETRY_BRIDGE_INTEREST_CHANNEL,
  TELEMETRY_BRIDGE_SIMULATE_CHANNEL,
  TELEMETRY_BRIDGE_SNAPSHOT_CHANNEL,
  TELEMETRY_BRIDGE_START_CHANNEL,
  TELEMETRY_BRIDGE_STATUS_CHANGED_CHANNEL,
  TELEMETRY_BRIDGE_STATUS_CHANNEL,
  type TelemetryBridgeStatus
} from '../../shared/telemetry-bridge'
import { t } from '@shared/ui-text'

export function registerTelemetryBridge(deviceService: DeviceService): TelemetryBridgeService {
  const service = new TelemetryBridgeService(
    deviceService,
    (status) => broadcastToWindows(TELEMETRY_BRIDGE_STATUS_CHANGED_CHANNEL, status),
    (snapshot) => broadcastToWindows(TELEMETRY_BRIDGE_SNAPSHOT_CHANNEL, snapshot),
    (input) => broadcastToWindows(TELEMETRY_BRIDGE_INPUT_CHANNEL, input)
  )
  deviceService.attachPortClaims(service.handover)
  ipcMain.handle(TELEMETRY_BRIDGE_STATUS_CHANNEL, () => service.getStatus())
  ipcMain.handle(TELEMETRY_BRIDGE_INTEREST_CHANNEL, (_event, interest: unknown) => {
    if (isTelemetryInterest(interest)) service.setInterest(interest)
  })
  ipcMain.handle(TELEMETRY_BRIDGE_SIMULATE_CHANNEL, (_event, simulation: unknown) => {
    if (isTelemetrySimulation(simulation)) service.simulate(simulation)
  })
  ipcMain.handle(TELEMETRY_BRIDGE_START_CHANNEL, (_event, request: unknown) => {
    if (!isTelemetryBridgeStartRequest(request)) {
      const result: DeviceResult<TelemetryBridgeStatus> = {
        ok: false,
        error: {
          code: 'invalid_request',
          message: t('protocol.bridgeService.invalidRequest')
        }
      }
      return result
    }
    return service.start(request)
  })
  void service.start({
    port: LINK_DEFAULT_PORT,
    simhubHost: LINK_DEFAULT_SIMHUB_HOST,
    simhubPort: LINK_SOURCE_PORT
  })
  return service
}
