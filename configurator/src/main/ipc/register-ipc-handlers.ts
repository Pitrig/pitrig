import { app, ipcMain } from 'electron'

import { broadcastToWindows } from './broadcast'
import { registerAssetHandlers } from './register-asset-handlers'
import { registerLibraryHandlers } from './register-library-handlers'
import {
  invalidConfigurationRequest,
  isConfigurationResetRequest,
  isConnectRequest,
  isControlCommandRequest,
  isJsonDocumentRequest
} from './request-guards'
import {
  CONTROL_COMMAND_CHANNEL,
  SERIAL_TRAFFIC_CHANNEL,
  type ControlCommandResult,
  type SerialTrafficLog
} from '../../shared/debug'
import {
  DEVICE_AUTO_CONNECT_CHANNEL,
  DEVICE_CANCEL_AUTO_CONNECT_CHANNEL,
  DEVICE_CONFIGURATION_APPLY_CHANNEL,
  DEVICE_CONFIGURATION_READ_CHANNEL,
  DEVICE_CONFIGURATION_RESET_CHANNEL,
  DEVICE_CONFIGURATION_SAVE_CHANNEL,
  DEVICE_CONNECT_CHANNEL,
  DEVICE_DISCONNECT_CHANNEL,
  DEVICE_GET_STATE_CHANNEL,
  DEVICE_LIST_PORTS_CHANNEL,
  DEVICE_REBOOT_CHANNEL,
  DEVICE_STATE_CHANGED_CHANNEL,
  type DeviceResult,
  type DeviceState
} from '../../shared/device'
import { FIRMWARE_UPLOAD_PROGRESS_CHANNEL, type FirmwareUploadProgress } from '../../shared/firmware-update'
import { FONT_LIBRARY_CHANGED_CHANNEL, type FontLibrarySnapshot } from '../../shared/font-library'
import { APP_GET_INFO_CHANNEL, type AppInfo } from '../../shared/ipc'
import {
  SAVE_PROGRESS_CHANNEL,
  SAVE_TO_BOARD_CHANNEL,
  type SaveProgress,
  type SaveToBoardResult
} from '../../shared/save-to-board'
import type { AssetUploadProgress } from '../../shared/asset-upload'
import { IMAGE_UPLOAD_PROGRESS_CHANNEL } from '../../shared/image-assets'
import { DeviceService } from '../device/device-service'
import { ConfigurationFileService } from '../configuration-files/configuration-file-service'
import { FirmwareUpdateService } from '../firmware-update/firmware-update-service'
import { FontAssetService } from '../font-assets/font-asset-service'
import { FontCatalogService } from '../font-library/font-catalog-service'
import { FontLibraryService } from '../font-library/font-library-service'
import { SaveToBoardService } from '../save-to-board/save-to-board-service'
import { ImageAssetService } from '../image-assets/image-asset-service'
import { TemplateService } from '../templates/template-service'
import { ConfigLibraryService } from '../configs/config-library-service'
import { PreviewAssetCache } from '../assets/preview-asset-cache'
import { SimHubProfileService } from '../simhub-profile/simhub-profile-service'

// The device and save channels, plus the two domain registrars: the author's
// folders in register-library-handlers.ts and everything uploaded or exported
// in register-asset-handlers.ts. Every request is checked by a guard before a
// service sees it; the renderer is separate code and its word is not taken.

export function registerIpcHandlers(
  deviceService: DeviceService,
  fontAssetService: FontAssetService,
  imageAssetService: ImageAssetService,
  firmwareUpdateService: FirmwareUpdateService,
  simHubProfileService: SimHubProfileService,
  configurationFileService: ConfigurationFileService,
  previewAssetCache: PreviewAssetCache,
  templateService: TemplateService,
  fontLibraryService: FontLibraryService,
  fontCatalogService: FontCatalogService,
  saveToBoardService: SaveToBoardService,
  configLibraryService: ConfigLibraryService
): void {
  ipcMain.handle(APP_GET_INFO_CHANNEL, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))
  registerLibraryHandlers(configurationFileService, configLibraryService, templateService)
  registerAssetHandlers(
    deviceService,
    fontAssetService,
    imageAssetService,
    firmwareUpdateService,
    simHubProfileService,
    previewAssetCache,
    fontLibraryService,
    fontCatalogService
  )
  ipcMain.handle(DEVICE_LIST_PORTS_CHANNEL, () => deviceService.listPorts())
  ipcMain.handle(DEVICE_GET_STATE_CHANNEL, () => deviceService.getState())
  ipcMain.handle(DEVICE_AUTO_CONNECT_CHANNEL, () => deviceService.autoConnect())
  ipcMain.handle(DEVICE_CANCEL_AUTO_CONNECT_CHANNEL, () => deviceService.cancelAutoConnect())
  ipcMain.handle(DEVICE_DISCONNECT_CHANNEL, () => deviceService.disconnect())
  ipcMain.handle(DEVICE_CONFIGURATION_READ_CHANNEL, () => deviceService.readConfiguration())
  ipcMain.handle(DEVICE_CONFIGURATION_RESET_CHANNEL, (_event, request: unknown) => {
    const document = isConfigurationResetRequest(request) ? request.document : undefined
    return deviceService.resetConfiguration(document)
  })
  ipcMain.handle(DEVICE_CONFIGURATION_APPLY_CHANNEL, async (_event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.applyConfiguration(request.json, request.documents)
  })
  ipcMain.handle(DEVICE_CONFIGURATION_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.saveConfiguration(request.json, request.documents)
  })
  ipcMain.handle(DEVICE_REBOOT_CHANNEL, () => deviceService.reboot())
  ipcMain.handle(CONTROL_COMMAND_CHANNEL, (_event, request: unknown) => {
    if (!isControlCommandRequest(request)) {
      const result: ControlCommandResult = {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid control command request.' }
      }
      return result
    }
    return deviceService.sendControlCommand(request.command)
  })
  ipcMain.handle(SAVE_TO_BOARD_CHANNEL, (_event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
      const result: SaveToBoardResult = {
        ok: false,
        error: { code: 'invalid_configuration', message: 'Invalid save request.' }
      }
      return result
    }
    return saveToBoardService.save({ json: request.json, documents: request.documents })
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

export function broadcastFontLibraryChanged(snapshot: FontLibrarySnapshot): void {
  broadcastToWindows(FONT_LIBRARY_CHANGED_CHANNEL, snapshot)
}

export function broadcastImageUploadProgress(progress: AssetUploadProgress): void {
  broadcastToWindows(IMAGE_UPLOAD_PROGRESS_CHANNEL, progress)
}

export function broadcastFirmwareUploadProgress(progress: FirmwareUploadProgress): void {
  broadcastToWindows(FIRMWARE_UPLOAD_PROGRESS_CHANNEL, progress)
}

export function broadcastSaveProgress(progress: SaveProgress): void {
  broadcastToWindows(SAVE_PROGRESS_CHANNEL, progress)
}

export function broadcastDeviceState(state: DeviceState): void {
  broadcastToWindows(DEVICE_STATE_CHANGED_CHANNEL, state)
}

export function broadcastSerialTraffic(log: SerialTrafficLog): void {
  broadcastToWindows(SERIAL_TRAFFIC_CHANNEL, log)
}
