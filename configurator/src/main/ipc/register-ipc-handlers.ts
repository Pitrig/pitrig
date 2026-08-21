import { app, BrowserWindow, ipcMain } from 'electron'

import { broadcastToWindows } from './broadcast'
import {
  invalidConfigurationRequest,
  isConfigurationIdRequest,
  isConfigurationPathRequest,
  isConfigurationSaveRequest,
  isConnectRequest,
  isControlCommandRequest,
  isFirmwareUploadRequest,
  isFontCatalogPreviewRequest,
  isFontFacesRequest,
  isFontLibraryAddRequest,
  isFontLibraryIdRequest,
  isFontLibraryImportRequest,
  isImageUploadRequest,
  isConfigurationResetRequest,
  isJsonDocumentRequest,
  isSimHubProfileExportRequest,
  isTemplateIdRequest,
  isTemplateSaveRequest
} from './request-guards'

import {
  CONTROL_COMMAND_CHANNEL,
  SERIAL_TRAFFIC_CHANNEL,
  type ControlCommandResult,
  type SerialTrafficLog
} from '../../shared/debug'
import {
  CONFIG_LIBRARY_DELETE_CHANNEL,
  CONFIG_LIBRARY_LIST_CHANNEL,
  CONFIG_LIBRARY_READ_CHANNEL,
  CONFIG_LIBRARY_SAVE_CHANNEL,
  CONFIG_RECENT_FORGET_CHANNEL,
  CONFIG_RECENT_READ_CHANNEL,
  type ConfigLibraryResult
} from '../../shared/config-library'
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
  FONT_CLEAR_CHANNEL
} from '../../shared/font-assets'
import {
  FONT_CATALOG_LIST_CHANNEL,
  FONT_CATALOG_PREVIEW_CHANNEL,
  FONT_LIBRARY_ADD_CHANNEL,
  FONT_LIBRARY_CHANGED_CHANNEL,
  FONT_LIBRARY_FACES_CHANNEL,
  FONT_LIBRARY_IMPORT_CHANNEL,
  FONT_LIBRARY_LIST_CHANNEL,
  FONT_LIBRARY_REMOVE_CHANNEL,
  type FontLibraryResult,
  type FontLibrarySnapshot
} from '../../shared/font-library'
import { APP_GET_INFO_CHANNEL, type AppInfo } from '../../shared/ipc'
import {
  SAVE_PROGRESS_CHANNEL,
  SAVE_TO_BOARD_CHANNEL,
  type SaveProgress,
  type SaveToBoardResult
} from '../../shared/save-to-board'
import {
  SIMHUB_PROFILE_EXPORT_CHANNEL,
  type SimHubProfileResult
} from '../../shared/simhub-profile'
import { DeviceService } from '../device/device-service'
import { ConfigurationFileService } from '../configuration-files/configuration-file-service'
import { FirmwareUpdateService } from '../firmware-update/firmware-update-service'
import { FontAssetService } from '../font-assets/font-asset-service'
import { FontCatalogService } from '../font-library/font-catalog-service'
import { FontLibraryService } from '../font-library/font-library-service'
import { SaveToBoardService } from '../save-to-board/save-to-board-service'
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
import { ConfigLibraryService } from '../configs/config-library-service'
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
  ipcMain.handle(CONFIG_LIBRARY_LIST_CHANNEL, () => configLibraryService.list())
  ipcMain.handle(CONFIG_LIBRARY_READ_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationIdRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.read(request.id)
  })
  ipcMain.handle(CONFIG_LIBRARY_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationSaveRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.save(request)
  })
  ipcMain.handle(CONFIG_LIBRARY_DELETE_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationIdRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.remove(request.id)
  })
  ipcMain.handle(CONFIG_RECENT_READ_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationPathRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.readRecent(request.path)
  })
  ipcMain.handle(CONFIG_RECENT_FORGET_CHANNEL, (_event, request: unknown) => {
    if (!isConfigurationPathRequest(request)) return invalidConfigLibraryRequest()
    return configLibraryService.forgetRecent(request.path)
  })
  ipcMain.handle(TEMPLATE_LIST_CHANNEL, () => templateService.list())
  ipcMain.handle(TEMPLATE_READ_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateIdRequest(request)) return invalidTemplateRequest()
    return templateService.read(request.id, request.kind)
  })
  ipcMain.handle(TEMPLATE_SAVE_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateSaveRequest(request)) return invalidTemplateRequest()
    return templateService.save(request)
  })
  ipcMain.handle(TEMPLATE_DELETE_CHANNEL, (_event, request: unknown) => {
    if (!isTemplateIdRequest(request)) return invalidTemplateRequest()
    return templateService.remove(request.id, request.kind)
  })
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
  ipcMain.handle(FONT_LIBRARY_LIST_CHANNEL, () => fontLibraryService.list())
  ipcMain.handle(FONT_LIBRARY_FACES_CHANNEL, (_event, request: unknown) =>
    isFontFacesRequest(request) ? fontLibraryService.readFaces(request.ids) : []
  )
  // The library changed under the renderer's feet, so it is told rather than
  // left to notice: the canvas draws from it and the picker lists it.
  ipcMain.handle(FONT_LIBRARY_IMPORT_CHANNEL, async (event, request: unknown) => {
    if (!isFontLibraryImportRequest(request)) return invalidFontLibraryRequest()
    const result = await fontLibraryService.import(
      request.id,
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
    if (result.ok && result.value) await broadcastFontLibrary(fontLibraryService)
    return result
  })
  ipcMain.handle(FONT_CATALOG_LIST_CHANNEL, () => fontCatalogService.list())
  ipcMain.handle(FONT_CATALOG_PREVIEW_CHANNEL, async (_event, request: unknown) =>
    isFontCatalogPreviewRequest(request)
      ? ((await fontCatalogService.preview(request.family)) ?? null)
      : null
  )
  ipcMain.handle(FONT_LIBRARY_ADD_CHANNEL, async (_event, request: unknown) => {
    if (!isFontLibraryAddRequest(request)) return invalidFontLibraryRequest()
    const face = await fontCatalogService.faceFor(request.family, request.variant)
    if (!face) {
      return {
        ok: false as const,
        error: {
          code: 'download_failed' as const,
          message: `${request.family} could not be downloaded. Check the connection, or import the file.`
        }
      }
    }
    const added = await fontLibraryService.addDownloaded(
      request.family,
      request.variant,
      request.category ?? face.category,
      face.bytes
    )
    if (added.ok) await broadcastFontLibrary(fontLibraryService)
    return added
  })
  ipcMain.handle(FONT_LIBRARY_REMOVE_CHANNEL, async (_event, request: unknown) => {
    if (!isFontLibraryIdRequest(request)) return invalidFontLibraryRequest()
    const result = await fontLibraryService.remove(request.id)
    if (result.ok) await broadcastFontLibrary(fontLibraryService)
    return result
  })
  ipcMain.handle(FONT_CANCEL_UPLOAD_CHANNEL, () => fontAssetService.cancel())
  // Erasing the board's package says nothing about the author's library, so
  // nothing local is cleared with it — the canvas keeps drawing what it drew.
  ipcMain.handle(FONT_CLEAR_CHANNEL, () => deviceService.clearFonts())
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

function invalidFontLibraryRequest(): FontLibraryResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_request', message: 'Invalid font library request.' }
  }
}

async function broadcastFontLibrary(service: FontLibraryService): Promise<void> {
  broadcastFontLibraryChanged(await service.list())
}

export function broadcastFontLibraryChanged(snapshot: FontLibrarySnapshot): void {
  broadcastToWindows(FONT_LIBRARY_CHANGED_CHANNEL, snapshot)
}

function invalidConfigLibraryRequest(): ConfigLibraryResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_configuration', message: 'Invalid configuration library request.' }
  }
}

function invalidTemplateRequest(): TemplateResult<never> {
  return { ok: false, error: { code: 'invalid_template', message: 'Invalid template request.' } }
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
