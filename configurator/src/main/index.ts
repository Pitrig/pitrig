import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { DeviceService } from './device/device-service'
import { ConfigurationFileService } from './configuration-files/configuration-file-service'
import {
  broadcastDevelopmentSerialTraffic,
  broadcastDeviceState,
  broadcastFirmwareUploadProgress,
  broadcastFontUploadProgress,
  broadcastImageUploadProgress,
  registerIpcHandlers
} from './ipc/register-ipc-handlers'
import { PreviewAssetCache } from './assets/preview-asset-cache'
import { FirmwareUpdateService } from './firmware-update/firmware-update-service'
import { FontAssetService } from './font-assets/font-asset-service'
import { ImageAssetService } from './image-assets/image-asset-service'
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
const fontAssetService = new FontAssetService(
  deviceService,
  broadcastFontUploadProgress,
  previewAssetCache
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
    templateService
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
