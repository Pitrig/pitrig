import { app, BrowserWindow, ipcMain } from 'electron'

import { broadcastToWindows } from './broadcast'
import {
  invalidConfigurationRequest,
  isConnectRequest,
  isFirmwareUploadRequest,
  isFontUploadRequest,
  isImageUploadRequest,
  isJsonDocumentRequest,
  isSimHubProfileExportRequest,
  isTemplateIdRequest,
  isTemplateSaveRequest
} from './request-guards'

import {
  DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL,
  type SerialTrafficLog
} from '../../shared/development'
import {
  CONFIGURATION_FILE_LOAD_CHANNEL,
  CONFIGURATION_FILE_SAVE_CHANNEL,
  type ConfigurationFileResult
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
  type DeviceResult,
  type DeviceState
} from '../../shared/device'
import {
  FIRMWARE_CANCEL_UPLOAD_CHANNEL,
  FIRMWARE_SELECT_SOURCE_CHANNEL,
  FIRMWARE_UPLOAD_CHANNEL,
  FIRMWARE_UPLOAD_PROGRESS_CHANNEL,
  type FirmwareUpdateResult,
  type FirmwareUploadProgress
} from '../../shared/firmware-update'
import {
  FONT_CANCEL_UPLOAD_CHANNEL,
  FONT_CLEAR_CHANNEL,
  FONT_SELECT_SOURCE_CHANNEL,
  FONT_UPLOAD_CHANNEL,
  FONT_UPLOAD_PROGRESS_CHANNEL,
  type FontAssetResult,
  type FontUploadProgress
} from '../../shared/font-assets'
import { APP_GET_INFO_CHANNEL, type AppInfo } from '../../shared/ipc'
import {
  SIMHUB_PROFILE_EXPORT_CHANNEL,
  type SimHubProfileResult
} from '../../shared/simhub-profile'
import { DeviceService } from '../device/device-service'
import { ConfigurationFileService } from '../configuration-files/configuration-file-service'
import { FirmwareUpdateService } from '../firmware-update/firmware-update-service'
import { FontAssetService } from '../font-assets/font-asset-service'
import { ImageAssetService } from '../image-assets/image-asset-service'
import type { AssetResult, AssetUploadProgress } from '../../shared/asset-upload'
import {
  IMAGE_CANCEL_UPLOAD_CHANNEL,
  IMAGE_CLEAR_CHANNEL,
  IMAGE_SELECT_SOURCE_CHANNEL,
  IMAGE_UPLOAD_CHANNEL,
  IMAGE_UPLOAD_PROGRESS_CHANNEL
} from '../../shared/image-assets'
import { PREVIEW_ASSETS_READ_CHANNEL } from '../../shared/preview-assets'
import {
  TEMPLATE_DELETE_CHANNEL,
  TEMPLATE_LIST_CHANNEL,
  TEMPLATE_READ_CHANNEL,
  TEMPLATE_SAVE_CHANNEL,
  type TemplateResult
} from '../../shared/templates'
import { TemplateService } from '../templates/template-service'
import { PreviewAssetCache } from '../assets/preview-asset-cache'
import { SimHubProfileService } from '../simhub-profile/simhub-profile-service'

export function registerIpcHandlers(
  deviceService: DeviceService,
  fontAssetService: FontAssetService,
  imageAssetService: ImageAssetService,
  firmwareUpdateService: FirmwareUpdateService,
  simHubProfileService: SimHubProfileService,
  configurationFileService: ConfigurationFileService,
  previewAssetCache: PreviewAssetCache,
  templateService: TemplateService
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
  ipcMain.handle(TEMPLATE_LIST_CHANNEL, () => templateService.list())
  ipcMain.handle(TEMPLATE_READ_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateIdRequest(request)) return invalidTemplateRequest()
    return templateService.read(request.id)
  })
  ipcMain.handle(TEMPLATE_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateSaveRequest(request)) return invalidTemplateRequest()
    return templateService.save(request)
  })
  ipcMain.handle(TEMPLATE_DELETE_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateIdRequest(request)) return invalidTemplateRequest()
    return templateService.remove(request.id)
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
  // The cache stands for what the board holds, so it is emptied with it rather
  // than left describing faces the device no longer has.
  ipcMain.handle(FONT_CLEAR_CHANNEL, async () => {
    const result = await deviceService.clearFonts()
    if (result.ok) await previewAssetCache.clearFonts().catch(() => undefined)
    return result
  })
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
  ipcMain.handle(FIRMWARE_SELECT_SOURCE_CHANNEL, (event) =>
    firmwareUpdateService.selectSource(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )
  ipcMain.handle(FIRMWARE_CANCEL_UPLOAD_CHANNEL, () => firmwareUpdateService.cancel())
  ipcMain.handle(FIRMWARE_UPLOAD_CHANNEL, (_event, request: unknown) => {
    if (!isFirmwareUploadRequest(request)) {
      const result: FirmwareUpdateResult<void> = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid firmware upload request.' }
      }
      return result
    }
    return firmwareUpdateService.upload(request)
  })
  ipcMain.handle(IMAGE_SELECT_SOURCE_CHANNEL, (event) =>
    imageAssetService.selectSource(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )
  ipcMain.handle(IMAGE_CANCEL_UPLOAD_CHANNEL, () => imageAssetService.cancel())
  ipcMain.handle(IMAGE_CLEAR_CHANNEL, async () => {
    const result = await deviceService.clearImages()
    if (result.ok) await previewAssetCache.clearImages().catch(() => undefined)
    return result
  })
  ipcMain.handle(PREVIEW_ASSETS_READ_CHANNEL, () => previewAssetCache.read())
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

function invalidTemplateRequest(): TemplateResult<never> {
  return { ok: false, error: { code: 'invalid_template', message: 'Invalid template request.' } }
}

export function broadcastImageUploadProgress(progress: AssetUploadProgress): void {
  broadcastToWindows(IMAGE_UPLOAD_PROGRESS_CHANNEL, progress)
}

/** Shape-checked like every other payload: the renderer is not trusted. */
export function broadcastFontUploadProgress(progress: FontUploadProgress): void {
  broadcastToWindows(FONT_UPLOAD_PROGRESS_CHANNEL, progress)
}

export function broadcastFirmwareUploadProgress(progress: FirmwareUploadProgress): void {
  broadcastToWindows(FIRMWARE_UPLOAD_PROGRESS_CHANNEL, progress)
}

export function broadcastDeviceState(state: DeviceState): void {
  broadcastToWindows(DEVICE_STATE_CHANGED_CHANNEL, state)
}

export function broadcastDevelopmentSerialTraffic(log: SerialTrafficLog): void {
  broadcastToWindows(DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL, log)
}
