import { app, BrowserWindow, ipcMain } from 'electron'

import {
  DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL,
  type SerialTrafficLog
} from '../../shared/development'
import {
  DEVICE_AUTO_CONNECT_CHANNEL,
  DEVICE_CANCEL_AUTO_CONNECT_CHANNEL,
  DEVICE_CONNECT_CHANNEL,
  DEVICE_DISCONNECT_CHANNEL,
  DEVICE_GET_STATE_CHANNEL,
  DEVICE_LIST_PORTS_CHANNEL,
  DEVICE_STATE_CHANGED_CHANNEL,
  type ConnectDeviceRequest,
  type DeviceResult,
  type DeviceState
} from '../../shared/device'
import { APP_GET_INFO_CHANNEL, type AppInfo } from '../../shared/ipc'
import { DeviceService } from '../device/device-service'

export function registerIpcHandlers(deviceService: DeviceService): void {
  ipcMain.handle(APP_GET_INFO_CHANNEL, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))
  ipcMain.handle(DEVICE_LIST_PORTS_CHANNEL, () => deviceService.listPorts())
  ipcMain.handle(DEVICE_GET_STATE_CHANNEL, () => deviceService.getState())
  ipcMain.handle(DEVICE_AUTO_CONNECT_CHANNEL, () => deviceService.autoConnect())
  ipcMain.handle(DEVICE_CANCEL_AUTO_CONNECT_CHANNEL, () => deviceService.cancelAutoConnect())
  ipcMain.handle(DEVICE_DISCONNECT_CHANNEL, () => deviceService.disconnect())
  ipcMain.handle(DEVICE_CONNECT_CHANNEL, (_event, request: unknown) => {
    if (!isConnectRequest(request)) {
      const result: DeviceResult<DeviceState> = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid serial connection request.' }
      }
      return result
    }
    return deviceService.connect(request.portId, request.baudRate)
  })
}

export function broadcastDeviceState(state: DeviceState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(DEVICE_STATE_CHANGED_CHANNEL, state)
    }
  }
}

export function broadcastDevelopmentSerialTraffic(log: SerialTrafficLog): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL, log)
    }
  }
}

function isConnectRequest(value: unknown): value is ConnectDeviceRequest {
  if (!value || typeof value !== 'object') {
    return false
  }
  const request = value as Partial<ConnectDeviceRequest>
  return (
    typeof request.portId === 'string' &&
    request.portId.length > 0 &&
    request.portId.length <= 128 &&
    typeof request.baudRate === 'number' &&
    Number.isInteger(request.baudRate) &&
    request.baudRate >= 9_600 &&
    request.baudRate <= 2_000_000
  )
}
