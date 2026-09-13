import { app, ipcMain } from 'electron'

import { broadcastToWindows } from './broadcast'
import { registerAssetHandlers } from './register-asset-handlers'
import { registerLibraryHandlers } from './register-library-handlers'
import {
  invalidConfigurationRequest,
  isConfigurationResetRequest,
  isConnectRequest,
  isJsonDocumentRequest
} from './request-guards'
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
import type { AppServices } from '../app-services'
import { t } from '@shared/ui-text'

export function registerIpcHandlers({
  deviceService,
  fontAssetService,
  imageAssetService,
  firmwareUpdateService,
  simHubProfileService,
  configurationFileService,
  previewAssetCache,
  templateService,
  fontLibraryService,
  fontCatalogService,
  saveToBoardService,
  configLibraryService
}: AppServices): void {
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
    if (!isConfigurationResetRequest(request)) {
      return invalidConfigurationRequest()
    }
    return deviceService.resetConfiguration(request?.document)
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
  ipcMain.handle(DEVICE_REBOOT_CHANNEL, () => deviceService.rebootAndReconnect())
  ipcMain.handle(SAVE_TO_BOARD_CHANNEL, (_event, request: unknown) => {
    if (!isJsonDocumentRequest(request)) {
      const result: SaveToBoardResult = {
        ok: false,
        error: { code: 'invalid_configuration', message: t('ipc.registerIpcHandlers.invalidSaveRequest') }
      }
      return result
    }
    return saveToBoardService.save({ json: request.json, documents: request.documents })
  })
  ipcMain.handle(DEVICE_CONNECT_CHANNEL, (_event, request: unknown) => {
    if (!isConnectRequest(request)) {
      const result: DeviceResult<DeviceState> = {
        ok: false,
        error: { code: 'invalid_request', message: t('ipc.registerIpcHandlers.invalidSerialConnectionRequest') }
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
