import { app, BrowserWindow, crashReporter } from 'electron'
import { join } from 'node:path'

applyBranding()
crashReporter.start({ uploadToServer: false })

import { BenchService } from './bench/bench-service'
import {
  broadcastBenchSample,
  broadcastBenchStatus,
  broadcastSerialTraffic,
  registerDebugHandlers
} from './ipc/register-debug-handlers'
import { createAppServices, disposeAppServices, type AppServices } from '@main/app-services'
import { createAppWindow, isDevelopment } from '@main/app-window'
import { applyBranding, applyDockIcon } from '@main/branding'
import {
  broadcastDeviceState,
  broadcastFirmwareUploadProgress,
  broadcastImageUploadProgress,
  broadcastSaveProgress,
  registerIpcHandlers
} from '@main/ipc/register-ipc-handlers'

if (isDevelopment() && process.env.SIMCORE_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.SIMCORE_REMOTE_DEBUG)
  app.commandLine.appendSwitch('remote-allow-origins', 'http://localhost')
}

const services: AppServices = createAppServices({
  onDeviceState: broadcastDeviceState,
  onFirmwareUploadProgress: broadcastFirmwareUploadProgress,
  onImageUploadProgress: broadcastImageUploadProgress,
  onSaveProgress: broadcastSaveProgress,
  onSerialTraffic: broadcastSerialTraffic
})
const benchService = new BenchService(
  {
    deviceService: services.deviceService,
    fontAssets: services.fontAssetService,
    fontLibrary: services.fontLibraryService,
    imageAssets: services.imageAssetService
  },
  broadcastBenchStatus,
  broadcastBenchSample
)
let quitAfterDeviceCleanup = false

function createWindow(): void {
  createAppWindow({
    preload: join(__dirname, '../preload/index.cjs'),
    renderer: '../renderer/index.html',
    width: 1440
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
  registerDebugHandlers(services.deviceService, services.firmwareUpdateService, benchService)
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
