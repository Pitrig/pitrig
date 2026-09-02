import { BrowserWindow, ipcMain } from 'electron'

import {
  isFirmwareUploadRequest,
  isFontCatalogPreviewRequest,
  isFontFacesRequest,
  isFontLibraryAddRequest,
  isFontLibraryIdRequest,
  isFontLibraryImportRequest,
  isImageUploadRequest,
  isSimHubProfileExportRequest
} from './request-guards'
import type { AssetResult } from '../../shared/asset-upload'
import {
  FIRMWARE_CANCEL_UPLOAD_CHANNEL,
  FIRMWARE_SELECT_SOURCE_CHANNEL,
  FIRMWARE_UPLOAD_CHANNEL,
  type FirmwareUpdateResult
} from '../../shared/firmware-update'
import { FONT_CANCEL_UPLOAD_CHANNEL, FONT_CLEAR_CHANNEL } from '../../shared/font-assets'
import {
  FONT_CATALOG_LIST_CHANNEL,
  FONT_CATALOG_PREVIEW_CHANNEL,
  FONT_LIBRARY_ADD_CHANNEL,
  FONT_LIBRARY_FACES_CHANNEL,
  FONT_LIBRARY_IMPORT_CHANNEL,
  FONT_LIBRARY_LIST_CHANNEL,
  FONT_LIBRARY_REMOVE_CHANNEL,
  type FontLibraryResult
} from '../../shared/font-library'
import {
  IMAGE_CANCEL_UPLOAD_CHANNEL,
  IMAGE_CLEAR_CHANNEL,
  IMAGE_SELECT_SOURCE_CHANNEL,
  IMAGE_UPLOAD_CHANNEL
} from '../../shared/image-assets'
import { PREVIEW_ASSETS_READ_CHANNEL } from '../../shared/preview-assets'
import {
  SIMHUB_PROFILE_EXPORT_CHANNEL,
  type SimHubProfileResult
} from '../../shared/simhub-profile'
import { PreviewAssetCache } from '../assets/preview-asset-cache'
import { DeviceService } from '../device/device-service'
import { FirmwareUpdateService } from '../firmware-update/firmware-update-service'
import { FontAssetService } from '../font-assets/font-asset-service'
import { FontCatalogService } from '../font-library/font-catalog-service'
import { FontLibraryService } from '../font-library/font-library-service'
import { ImageAssetService } from '../image-assets/image-asset-service'
import { SimHubProfileService } from '../simhub-profile/simhub-profile-service'
import { broadcastFontLibraryChanged } from './register-ipc-handlers'
import { t } from '@shared/ui-text'

export function registerAssetHandlers(
  deviceService: DeviceService,
  fontAssetService: FontAssetService,
  imageAssetService: ImageAssetService,
  firmwareUpdateService: FirmwareUpdateService,
  simHubProfileService: SimHubProfileService,
  previewAssetCache: PreviewAssetCache,
  fontLibraryService: FontLibraryService,
  fontCatalogService: FontCatalogService
): void {
  ipcMain.handle(FONT_LIBRARY_LIST_CHANNEL, () => fontLibraryService.list())
  ipcMain.handle(FONT_LIBRARY_FACES_CHANNEL, (_event, request: unknown) =>
    isFontFacesRequest(request) ? fontLibraryService.readFaces(request.ids) : []
  )
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
          message: t('ipc.registerAssetHandlers.familyCouldNotBeDownloaded', { family: request.family })
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
  ipcMain.handle(FONT_CLEAR_CHANNEL, () => deviceService.clearFonts())
  ipcMain.handle(FIRMWARE_SELECT_SOURCE_CHANNEL, (event) =>
    firmwareUpdateService.selectSource(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )
  ipcMain.handle(FIRMWARE_CANCEL_UPLOAD_CHANNEL, () => firmwareUpdateService.cancel())
  ipcMain.handle(FIRMWARE_UPLOAD_CHANNEL, (_event, request: unknown) => {
    if (!isFirmwareUploadRequest(request)) {
      const result: FirmwareUpdateResult<void> = {
        ok: false,
        error: { code: 'invalid_request', message: t('ipc.registerAssetHandlers.invalidFirmwareUploadRequest') }
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
        error: { code: 'invalid_request', message: t('ipc.registerAssetHandlers.invalidImageUploadRequest') }
      }
      return result
    }
    return imageAssetService.upload(request)
  })
  ipcMain.handle(SIMHUB_PROFILE_EXPORT_CHANNEL, (event, request: unknown) => {
    if (!isSimHubProfileExportRequest(request)) {
      const result: SimHubProfileResult<never> = {
        ok: false,
        error: { code: 'invalid_request', message: t('ipc.registerAssetHandlers.invalidSimhubProfileRequest') }
      }
      return result
    }
    return simHubProfileService.export(
      request,
      BrowserWindow.fromWebContents(event.sender) ?? undefined
    )
  })
}

function invalidFontLibraryRequest(): FontLibraryResult<never> {
  return {
    ok: false,
    error: { code: 'invalid_request', message: t('ipc.registerAssetHandlers.invalidFontLibraryRequest') }
  }
}

async function broadcastFontLibrary(service: FontLibraryService): Promise<void> {
  broadcastFontLibraryChanged(await service.list())
}
