import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { DeviceService } from './device/device-service'
import { ConfigurationFileService } from './configuration-files/configuration-file-service'
import {
  broadcastDevelopmentSerialTraffic,
  broadcastDeviceState,
  broadcastFirmwareUploadProgress,
  broadcastImageUploadProgress,
  broadcastSaveProgress,
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

const isDevelopment = import.meta.env.DEV
const deviceService = new DeviceService(
  broadcastDeviceState,
  isDevelopment ? broadcastDevelopmentSerialTraffic : undefined
)
// Outside the app's own state, because it mirrors what a board holds rather
// than anything the user authored: deleting it costs the preview its fidelity
// until the next upload, and nothing else.
const previewAssetCache = new PreviewAssetCache(join(app.getPath('userData'), 'preview-assets'))
// The author's own faces, plus the ones bundled with the application. It also
// adopts the faces older versions cached to draw a preview with, so a project
// authored before the library keeps rendering the way it did.
const fontLibraryService = new FontLibraryService(
  join(app.getPath('userData'), 'font-library'),
  join(app.getPath('userData'), 'preview-assets', 'fonts')
)
// Browsing the catalog downloads faces the author may never choose, so its
// cache is separate from the library and can be deleted at any time.
const fontCatalogService = new FontCatalogService(
  join(app.getPath('userData'), 'font-catalog-cache')
)
const fontAssetService = new FontAssetService(deviceService, fontLibraryService)
// Saving is one sequence over the serial link, so it owns the order the other
// services run in rather than being assembled in a React component.
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
const simHubProfileService = new SimHubProfileService()
const configurationFileService = new ConfigurationFileService()
// The author's own saved dashboards, beside the app's other user data.
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
    saveToBoardService
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
