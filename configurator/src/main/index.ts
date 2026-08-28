import { app, BrowserWindow, crashReporter } from 'electron'
import { join } from 'node:path'

crashReporter.start({ uploadToServer: false })

import { BenchService } from './bench/bench-service'
import { DeviceService } from './device/device-service'
import { ConfigurationFileService } from './configuration-files/configuration-file-service'
import {
  broadcastBenchSample,
  broadcastBenchStatus,
  broadcastDeviceState,
  broadcastFirmwareUploadProgress,
  broadcastImageUploadProgress,
  broadcastSaveProgress,
  broadcastSerialTraffic,
  registerIpcHandlers
} from './ipc/register-ipc-handlers'
import { PreviewAssetCache } from './assets/preview-asset-cache'
import { FirmwareUpdateService } from './firmware-update/firmware-update-service'
import { FontAssetService } from './font-assets/font-asset-service'
import { FontCatalogService } from './font-library/font-catalog-service'
import { FontLibraryService } from './font-library/font-library-service'
import { ImageAssetService } from './image-assets/image-asset-service'
import { SaveToBoardService } from './save-to-board/save-to-board-service'
import { SimHubProfileService } from './simhub-profile/simhub-profile-service'
import { TemplateService } from './templates/template-service'
import { ConfigLibraryService } from './configs/config-library-service'
import { RecentConfigurations } from './configs/recent-configurations'

const isDevelopment = import.meta.env.DEV
if (isDevelopment && process.env.SIMCORE_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.SIMCORE_REMOTE_DEBUG)
  app.commandLine.appendSwitch('remote-allow-origins', 'http://localhost')
}
const deviceService = new DeviceService(broadcastDeviceState, broadcastSerialTraffic)
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
  broadcastSaveProgress
)
const imageAssetService = new ImageAssetService(
  deviceService,
  broadcastImageUploadProgress,
  previewAssetCache
)
const firmwareUpdateService = new FirmwareUpdateService(
  deviceService,
  broadcastFirmwareUploadProgress
)
const benchService = new BenchService(
  { deviceService, fontAssets: fontAssetService, imageAssets: imageAssetService },
  broadcastBenchStatus,
  broadcastBenchSample
)
const simHubProfileService = new SimHubProfileService()
const recentConfigurations = new RecentConfigurations(
  join(app.getPath('userData'), 'recent-configurations.json')
)
const configLibraryService = new ConfigLibraryService(
  join(app.getPath('userData'), 'configurations'),
  recentConfigurations
)
const configurationFileService = new ConfigurationFileService(recentConfigurations)
const templateService = new TemplateService(join(app.getPath('userData'), 'templates'))
let quitAfterDeviceCleanup = false

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDevelopment
    }
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[probe] render-process-gone', JSON.stringify(details))
  })

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(
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
    configLibraryService,
    benchService
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', (event) => {
  if (quitAfterDeviceCleanup) {
    return
  }
  event.preventDefault()
  benchService.dispose()
  fontAssetService.cancel()
  imageAssetService.cancel()
  firmwareUpdateService.cancel()
  void deviceService.dispose().finally(() => {
    quitAfterDeviceCleanup = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
