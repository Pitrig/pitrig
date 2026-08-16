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
import { ImageAssetService } from '../image-assets/image-asset-service'
import type { AssetResult, AssetUploadProgress } from '../../shared/asset-upload'
import {
  IMAGE_CANCEL_UPLOAD_CHANNEL,
  IMAGE_CLEAR_CHANNEL,
  IMAGE_COLOR_FORMATS,
  IMAGE_SELECT_SOURCE_CHANNEL,
  IMAGE_UPLOAD_CHANNEL,
  IMAGE_UPLOAD_PROGRESS_CHANNEL,
  type ImageUploadRequest
} from '../../shared/image-assets'
import { SimHubProfileService } from '../simhub-profile/simhub-profile-service'

export function registerIpcHandlers(
  deviceService: DeviceService,
  fontAssetService: FontAssetService,
  imageAssetService: ImageAssetService,
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
    if (!isJsonDocumentRequest(request)) {
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
  ipcMain.handle(DEVICE_CONFIGURATION_APPLY_CHANNEL, async (_event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.applyConfiguration(request.json)
  })
  ipcMain.handle(DEVICE_CONFIGURATION_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
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
  ipcMain.handle(IMAGE_SELECT_SOURCE_CHANNEL, (event) =>
    imageAssetService.selectSource(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )
  ipcMain.handle(IMAGE_CANCEL_UPLOAD_CHANNEL, () => imageAssetService.cancel())
  ipcMain.handle(IMAGE_CLEAR_CHANNEL, () => deviceService.clearImages())
  ipcMain.handle(IMAGE_UPLOAD_CHANNEL, (_event, request: unknown) => {
    if (!isImageUploadRequest(request)) {
      const result: AssetResult<void> = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid image upload request.' }
      }
      return result
    }
    return imageAssetService.upload(request)
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

export function broadcastImageUploadProgress(progress: AssetUploadProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IMAGE_UPLOAD_PROGRESS_CHANNEL, progress)
    }
  }
}

/** Shape-checked like every other payload: the renderer is not trusted. */
function isImageUploadRequest(value: unknown): value is ImageUploadRequest {
  if (typeof value !== 'object' || value === null) return false
  const assets = (value as ImageUploadRequest).assets
  return (
    Array.isArray(assets) &&
    assets.every(
      (asset) =>
        typeof asset === 'object' &&
        asset !== null &&
        typeof asset.sourceId === 'string' &&
        typeof asset.name === 'string' &&
        typeof asset.width === 'number' &&
        typeof asset.height === 'number' &&
        IMAGE_COLOR_FORMATS.includes(asset.format)
    )
  )
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

// Both the device and the file request are `{ json: string }`; the bound is the
// source-document limit, not the payload limit, which the parser enforces.
function isJsonDocumentRequest(
  value: unknown
): value is DeviceConfigurationRequest & ConfigurationFileSaveRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<DeviceConfigurationRequest>
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

// Shape only: the family rules and the source lookup belong to the service,
// which re-validates every request before it touches a device.
function isFontAssetInput(value: unknown): value is FontAssetInput {
  if (!value || typeof value !== 'object') return false
  const asset = value as Partial<FontAssetInput>
  return (
    typeof asset.sourceId === 'string' && asset.sourceId.length > 0 &&
    asset.sourceId.length <= 128 && typeof asset.family === 'string'
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
