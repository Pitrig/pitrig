import { app, BrowserWindow, crashReporter } from 'electron'
import { join } from 'node:path'

applyBranding()
crashReporter.start({ uploadToServer: false })

import { createAppServices, disposeAppServices, type AppServices } from './app-services'
import { createAppWindow, isDevelopment } from './app-window'
import { applyBranding, applyDockIcon } from './branding'
import {
  broadcastDeviceState,
  broadcastFirmwareUploadProgress,
  broadcastImageUploadProgress,
  broadcastSaveProgress,
  registerIpcHandlers
} from './ipc/register-ipc-handlers'

if (isDevelopment() && process.env.PITRIG_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.PITRIG_REMOTE_DEBUG)
  app.commandLine.appendSwitch('remote-allow-origins', 'http://localhost')
}

const services: AppServices = createAppServices({
  onDeviceState: broadcastDeviceState,
  onFirmwareUploadProgress: broadcastFirmwareUploadProgress,
  onImageUploadProgress: broadcastImageUploadProgress,
  onSaveProgress: broadcastSaveProgress
})
let quitAfterDeviceCleanup = false

function createWindow(): void {
  createAppWindow({
    preload: join(__dirname, '../preload/index.cjs'),
    renderer: '../renderer/index.html'
  })
}

app.whenReady().then(() => {
  applyDockIcon()
  registerIpcHandlers(
    services.deviceService,
    services.fontAssetService,
    services.imageAssetService,
    services.firmwareUpdateService,
    services.simHubProfileService,
    services.configurationFileService,
    services.previewAssetCache,
    services.templateService,
    services.fontLibraryService,
    services.fontCatalogService,
    services.saveToBoardService,
    services.configLibraryService
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
  void disposeAppServices(services).finally(() => {
    quitAfterDeviceCleanup = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
