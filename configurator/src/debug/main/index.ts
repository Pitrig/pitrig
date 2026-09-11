import { app, BrowserWindow, crashReporter } from 'electron'
import { join } from 'node:path'

applyBranding()
applyApplicationMenu()
crashReporter.start({ uploadToServer: false })

import { BenchService } from './bench/bench-service'
import {
  broadcastBenchSample,
  broadcastBenchStatus,
  broadcastSerialTraffic,
  registerDebugHandlers
} from './ipc/register-debug-handlers'
import { applyApplicationMenu } from '@main/app-menu'
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
import { registerTelemetryBridge } from '@main/telemetry-bridge/register-telemetry-bridge'
import { TELEMETRY_BRIDGE_INCLUDED } from '@shared/telemetry-bridge'

if (isDevelopment() && process.env.PITRIG_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.PITRIG_REMOTE_DEBUG)
  app.commandLine.appendSwitch('remote-allow-origins', 'http://localhost')
}

const services: AppServices = createAppServices({
  onDeviceState: broadcastDeviceState,
  onFirmwareUploadProgress: broadcastFirmwareUploadProgress,
  onImageUploadProgress: broadcastImageUploadProgress,
  onSaveProgress: broadcastSaveProgress,
  onSerialTraffic: broadcastSerialTraffic
})
const telemetryBridge = TELEMETRY_BRIDGE_INCLUDED
  ? registerTelemetryBridge(services.deviceService)
  : undefined
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
  registerIpcHandlers(services)
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
  void disposeAppServices(services, telemetryBridge).finally(() => {
    quitAfterDeviceCleanup = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
