import { app } from 'electron'
import { join } from 'node:path'

import { PreviewAssetCache } from './assets/preview-asset-cache'
import { ConfigLibraryService } from './configs/config-library-service'
import { RecentConfigurations } from './configs/recent-configurations'
import { ConfigurationFileService } from './configuration-files/configuration-file-service'
import { DeviceService } from './device/device-service'
import { BoardUpdateService } from './firmware-update/board-update-service'
import { FirmwareUpdateService } from './firmware-update/firmware-update-service'
import { FontAssetService } from './font-assets/font-asset-service'
import { FontCatalogService } from './font-library/font-catalog-service'
import { FontLibraryService } from './font-library/font-library-service'
import { ImageAssetService } from './image-assets/image-asset-service'
import { SaveToBoardService } from './save-to-board/save-to-board-service'
import type { TelemetryBridgeService } from './telemetry-bridge/bridge-service'
import { TemplateService } from './templates/template-service'
import type { AssetUploadProgress } from '../shared/asset-upload'
import type { DeviceState } from '../shared/device'
import type { BoardUpdateProgress, FirmwareUploadProgress } from '../shared/firmware-update'
import type { SaveProgress } from '../shared/save-to-board'
import type { SerialTrafficLog } from '../shared/serial-traffic'

export interface AppServiceBroadcasts {
  onDeviceState: (state: DeviceState) => void
  onFirmwareUploadProgress: (progress: FirmwareUploadProgress) => void
  onBoardUpdateProgress: (progress: BoardUpdateProgress) => void
  onImageUploadProgress: (progress: AssetUploadProgress) => void
  onSaveProgress: (progress: SaveProgress) => void
  onSerialTraffic?: (log: SerialTrafficLog) => void
}

export interface AppServices {
  deviceService: DeviceService
  previewAssetCache: PreviewAssetCache
  fontLibraryService: FontLibraryService
  fontCatalogService: FontCatalogService
  fontAssetService: FontAssetService
  saveToBoardService: SaveToBoardService
  imageAssetService: ImageAssetService
  firmwareUpdateService: FirmwareUpdateService
  boardUpdateService: BoardUpdateService
  configLibraryService: ConfigLibraryService
  configurationFileService: ConfigurationFileService
  templateService: TemplateService
}

export function createAppServices(broadcasts: AppServiceBroadcasts): AppServices {
  const deviceService = new DeviceService(broadcasts.onDeviceState, broadcasts.onSerialTraffic)
  const previewAssetCache = new PreviewAssetCache(join(app.getPath('userData'), 'preview-assets'))
  const fontLibraryService = new FontLibraryService(
    join(app.getPath('userData'), 'font-library'),
    join(app.getPath('userData'), 'preview-assets', 'fonts')
  )
  const fontCatalogService = new FontCatalogService(
    join(app.getPath('userData'), 'font-catalog-cache')
  )
  const fontAssetService = new FontAssetService(deviceService, fontLibraryService)
  const saveToBoardService = new SaveToBoardService(
    deviceService,
    fontAssetService,
    fontLibraryService,
    broadcasts.onSaveProgress
  )
  const imageAssetService = new ImageAssetService(
    deviceService,
    broadcasts.onImageUploadProgress,
    previewAssetCache
  )
  const firmwareUpdateService = new FirmwareUpdateService(
    deviceService,
    broadcasts.onFirmwareUploadProgress
  )
  const recentConfigurations = new RecentConfigurations(
    join(app.getPath('userData'), 'recent-configurations.json')
  )
  const configLibraryService = new ConfigLibraryService(
    join(app.getPath('userData'), 'configurations'),
    recentConfigurations
  )
  return {
    deviceService,
    previewAssetCache,
    fontLibraryService,
    fontCatalogService,
    fontAssetService,
    saveToBoardService,
    imageAssetService,
    firmwareUpdateService,
    boardUpdateService: new BoardUpdateService(
      deviceService,
      firmwareUpdateService,
      saveToBoardService,
      configLibraryService,
      broadcasts.onBoardUpdateProgress
    ),
    configLibraryService,
    configurationFileService: new ConfigurationFileService(recentConfigurations),
    templateService: new TemplateService(join(app.getPath('userData'), 'templates'))
  }
}

export async function disposeAppServices(
  services: AppServices,
  telemetryBridge?: TelemetryBridgeService
): Promise<void> {
  services.fontAssetService.cancel()
  services.imageAssetService.cancel()
  services.firmwareUpdateService.cancel()
  await services.deviceService.dispose()
  await telemetryBridge?.dispose()
}
