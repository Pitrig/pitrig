import { app, BrowserWindow, ipcMain } from 'electron'

import {
  DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL,
  type SerialTrafficLog
} from '../../shared/development'
import {
  CONFIGURATION_FILE_LOAD_CHANNEL,
  CONFIGURATION_FILE_SAVE_CHANNEL,
  type ConfigurationFileResult,
  type ConfigurationFileSaveRequest
} from '../../shared/configuration-files'
import {
  DEVICE_AUTO_CONNECT_CHANNEL,
  DEVICE_CANCEL_AUTO_CONNECT_CHANNEL,
  DEVICE_CONNECT_CHANNEL,
  DEVICE_CONFIGURATION_READ_CHANNEL,
  DEVICE_CONFIGURATION_RESET_CHANNEL,
  DEVICE_CONFIGURATION_APPLY_CHANNEL,
  DEVICE_CONFIGURATION_SAVE_CHANNEL,
  DEVICE_CONFIGURATION_VALIDATE_CHANNEL,
  DEVICE_DISCONNECT_CHANNEL,
  DEVICE_GET_STATE_CHANNEL,
  DEVICE_LIST_PORTS_CHANNEL,
  DEVICE_REBOOT_CHANNEL,
  DEVICE_STATE_CHANGED_CHANNEL,
  type ConnectDeviceRequest,
  type DeviceConfigurationRequest,
  type DeviceResult,
  type DeviceState
} from '../../shared/device'
import {
  FONT_CANCEL_UPLOAD_CHANNEL,
  FONT_CLEAR_CHANNEL,
  FONT_FAMILY_PATTERN,
  MAXIMUM_FONT_FAMILIES,
  FONT_SELECT_SOURCE_CHANNEL,
  FONT_UPLOAD_CHANNEL,
  FONT_UPLOAD_PROGRESS_CHANNEL,
  type FontAssetInput,
  type FontAssetResult,
  type FontUploadProgress,
  type FontUploadRequest
} from '../../shared/font-assets'
import { APP_GET_INFO_CHANNEL, type AppInfo } from '../../shared/ipc'
import {
  SIMHUB_PROFILE_EXPORT_CHANNEL,
  type SimHubProfileExportRequest,
  type SimHubProfileResult
} from '../../shared/simhub-profile'
import { DeviceService } from '../device/device-service'
import { ConfigurationFileService } from '../configuration-files/configuration-file-service'
import { FontAssetService } from '../font-assets/font-asset-service'
import { SimHubProfileService } from '../simhub-profile/simhub-profile-service'

export function registerIpcHandlers(
  deviceService: DeviceService,
  fontAssetService: FontAssetService,
  simHubProfileService: SimHubProfileService,
  configurationFileService: ConfigurationFileService
): void {
  ipcMain.handle(APP_GET_INFO_CHANNEL, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))
  ipcMain.handle(CONFIGURATION_FILE_LOAD_CHANNEL, (event) =>
    configurationFileService.load(
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
  )
  ipcMain.handle(CONFIGURATION_FILE_SAVE_CHANNEL, (event, request: unknown) => {
    if (!isConfigurationFileSaveRequest(request)) {
      const result: ConfigurationFileResult<never> = {
        ok: false,
        error: { code: 'invalid_configuration', message: 'Invalid configuration file request.' }
      }
      return result
    }
    return configurationFileService.save(
      request.json,
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
  })
  ipcMain.handle(DEVICE_LIST_PORTS_CHANNEL, () => deviceService.listPorts())
  ipcMain.handle(DEVICE_GET_STATE_CHANNEL, () => deviceService.getState())
  ipcMain.handle(DEVICE_AUTO_CONNECT_CHANNEL, () => deviceService.autoConnect())
  ipcMain.handle(DEVICE_CANCEL_AUTO_CONNECT_CHANNEL, () => deviceService.cancelAutoConnect())
  ipcMain.handle(DEVICE_DISCONNECT_CHANNEL, () => deviceService.disconnect())
  ipcMain.handle(DEVICE_CONFIGURATION_READ_CHANNEL, () => deviceService.readConfiguration())
  ipcMain.handle(DEVICE_CONFIGURATION_RESET_CHANNEL, () => deviceService.resetConfiguration())
  ipcMain.handle(DEVICE_CONFIGURATION_VALIDATE_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.validateConfiguration(request.json)
  })
  ipcMain.handle(DEVICE_CONFIGURATION_APPLY_CHANNEL, async (_event, request: unknown) => {
    if (!isConfigurationRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.applyConfiguration(request.json)
  })
  ipcMain.handle(DEVICE_CONFIGURATION_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.saveConfiguration(request.json)
  })
  ipcMain.handle(DEVICE_REBOOT_CHANNEL, () => deviceService.reboot())
  ipcMain.handle(FONT_SELECT_SOURCE_CHANNEL, (event) =>
    fontAssetService.selectSource(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )
  ipcMain.handle(FONT_CANCEL_UPLOAD_CHANNEL, () => fontAssetService.cancel())
  ipcMain.handle(FONT_CLEAR_CHANNEL, () => deviceService.clearFonts())
  ipcMain.handle(FONT_UPLOAD_CHANNEL, (_event, request: unknown) => {
    if (!isFontUploadRequest(request)) {
      const result: FontAssetResult<void> = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid font upload request.' }
      }
      return result
    }
    return fontAssetService.upload(request)
  })
  ipcMain.handle(SIMHUB_PROFILE_EXPORT_CHANNEL, (event, request: unknown) => {
    if (!isSimHubProfileExportRequest(request)) {
      const result: SimHubProfileResult<never> = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid SimHub profile request.' }
      }
      return result
    }
    return simHubProfileService.export(
      request,
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
  })
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

export function broadcastFontUploadProgress(progress: FontUploadProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(FONT_UPLOAD_PROGRESS_CHANNEL, progress)
    }
  }
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

function isConfigurationRequest(value: unknown): value is DeviceConfigurationRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<DeviceConfigurationRequest>
  return typeof request.json === 'string' && request.json.length <= 64 * 1024
}

function isConfigurationFileSaveRequest(
  value: unknown
): value is ConfigurationFileSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<ConfigurationFileSaveRequest>
  return typeof request.json === 'string' && request.json.length <= 64 * 1024
}

function invalidConfigurationRequest(): DeviceResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_request', message: 'Invalid device configuration request.' }
  }
}

function isFontUploadRequest(value: unknown): value is FontUploadRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<FontUploadRequest>
  return (
    Array.isArray(request.assets) &&
    request.assets.length <= MAXIMUM_FONT_FAMILIES &&
    request.assets.every(isFontAssetInput)
  )
}

function isFontAssetInput(value: unknown): value is FontAssetInput {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<FontAssetInput>
  return (
    typeof asset.sourceId === 'string' && asset.sourceId.length > 0 && asset.sourceId.length <= 128 &&
    typeof asset.family === 'string' && FONT_FAMILY_PATTERN.test(asset.family)
  )
}

function isSimHubProfileExportRequest(value: unknown): value is SimHubProfileExportRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<SimHubProfileExportRequest>
  return (
    Array.isArray(request.fieldNames) &&
    request.fieldNames.length > 0 &&
    request.fieldNames.length <= 256 &&
    request.fieldNames.every(
      (name) => typeof name === 'string' && name.length > 0 && name.length <= 39
    ) &&
    typeof request.baudRate === 'number' &&
    Number.isInteger(request.baudRate) &&
    request.baudRate >= 9_600 &&
    request.baudRate <= 2_000_000
  )
}
