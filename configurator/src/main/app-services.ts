import { app } from 'electron'
import { join } from 'node:path'

import { ConfigLibraryService } from './configs/config-library-service'
import { RecentConfigurations } from './configs/recent-configurations'
import { ConfigurationFileService } from './configuration-files/configuration-file-service'
import { DashboardFileService } from './dashboard-files/dashboard-file-service'
import { DeviceService } from './device/device-service'
import { BoardUpdateService } from './firmware-update/board-update-service'
import { FirmwareUpdateService } from './firmware-update/firmware-update-service'
import { FontAssetService } from './font-assets/font-asset-service'
import { FontCatalogService } from './font-library/font-catalog-service'
import { FontLibraryService } from './font-library/font-library-service'
import { ImageAssetService } from './image-assets/image-asset-service'
import { ImageLibraryService } from './image-library/image-library-service'
import { LegacyImageCache } from './image-library/legacy-image-cache'
import { SaveToBoardService } from './save-to-board/save-to-board-service'
import type { TelemetryBridgeService } from './telemetry-bridge/bridge-service'
import { BundledTemplateLibrary } from './templates/bundled-template-library'
import { TemplateService } from './templates/template-service'
import type { DeviceState } from '../shared/device'
import type { BoardUpdateProgress, FirmwareUploadProgress } from '../shared/firmware-update'
import type { FontLibrarySnapshot } from '../shared/font-library'
import type { ImageLibrarySnapshot } from '../shared/image-library'
import type { SaveProgress } from '../shared/save-to-board'
import type { SerialTrafficLog } from '../shared/serial-traffic'

export interface AppServiceBroadcasts {
  onDeviceState: (state: DeviceState) => void
  onFirmwareUploadProgress: (progress: FirmwareUploadProgress) => void
  onBoardUpdateProgress: (progress: BoardUpdateProgress) => void
  onSaveProgress: (progress: SaveProgress) => void
  onFontLibraryChanged?: (snapshot: FontLibrarySnapshot) => void
  onImageLibraryChanged?: (snapshot: ImageLibrarySnapshot) => void
  onSerialTraffic?: (log: SerialTrafficLog) => void
}

export interface AppServices {
  deviceService: DeviceService
  imageLibraryService: ImageLibraryService
  fontLibraryService: FontLibraryService
  fontCatalogService: FontCatalogService
  fontAssetService: FontAssetService
  saveToBoardService: SaveToBoardService
  imageAssetService: ImageAssetService
  firmwareUpdateService: FirmwareUpdateService
  boardUpdateService: BoardUpdateService
  configLibraryService: ConfigLibraryService
  configurationFileService: ConfigurationFileService
  dashboardFileService: DashboardFileService
  templateService: TemplateService
}

export function createAppServices(broadcasts: AppServiceBroadcasts): AppServices {
  const userData = app.getPath('userData')
  const deviceService = new DeviceService(broadcasts.onDeviceState, broadcasts.onSerialTraffic)
  const imageLibraryService = new ImageLibraryService(
    join(userData, 'image-library'),
    new LegacyImageCache(join(userData, 'preview-assets')),
    (snapshot) => broadcasts.onImageLibraryChanged?.(snapshot)
  )
  const fontLibraryService = new FontLibraryService(
    join(userData, 'font-library'),
    join(userData, 'preview-assets', 'fonts')
  )
  const fontCatalogService = new FontCatalogService(join(userData, 'font-catalog-cache'))
  const fontsChanged = (): void => {
    void fontLibraryService
      .list()
      .then((snapshot) => broadcasts.onFontLibraryChanged?.(snapshot))
      .catch(() => undefined)
  }
  const fontAssetService = new FontAssetService(deviceService, fontLibraryService)
  const imageAssetService = new ImageAssetService(deviceService, imageLibraryService)
  const saveToBoardService = new SaveToBoardService(
    deviceService,
    fontAssetService,
    { library: fontLibraryService, catalog: fontCatalogService, onLibraryChanged: fontsChanged },
    { imageAssets: imageAssetService, library: imageLibraryService },
    broadcasts.onSaveProgress
  )
  const firmwareUpdateService = new FirmwareUpdateService(
    deviceService,
    broadcasts.onFirmwareUploadProgress
  )
  const recentConfigurations = new RecentConfigurations(
    join(userData, 'recent-configurations.json')
  )
  const configLibraryService = new ConfigLibraryService(
    join(userData, 'configurations'),
    recentConfigurations
  )
  const dashboardFileService = new DashboardFileService(
    { images: imageLibraryService, fonts: fontLibraryService, catalog: fontCatalogService },
    fontsChanged,
    () => app.getVersion()
  )
  return {
    deviceService,
    imageLibraryService,
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
    configurationFileService: new ConfigurationFileService(
      recentConfigurations,
      dashboardFileService
    ),
    dashboardFileService,
    templateService: new TemplateService(
      join(userData, 'templates'),
      new BundledTemplateLibrary(dashboardFileService)
    )
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
