import { app, BrowserWindow, crashReporter } from 'electron'
import { join } from 'node:path'

applyBranding()
applyApplicationMenu()
crashReporter.start({ uploadToServer: false })

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

import { applyApplicationMenu } from './app-menu'
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
import { registerTelemetryBridge } from './telemetry-bridge/register-telemetry-bridge'
import { TELEMETRY_BRIDGE_INCLUDED } from '../shared/telemetry-bridge'

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
const telemetryBridge = TELEMETRY_BRIDGE_INCLUDED
  ? registerTelemetryBridge(services.deviceService)
  : undefined
const CLEANUP_TIMEOUT_MS = 4000
let quitAfterDeviceCleanup = false

function createWindow(): void {
  createAppWindow({
    preload: join(__dirname, '../preload/index.cjs'),
    renderer: '../renderer/index.html'
  })
}

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
})

app.whenReady().then(() => {
  applyDockIcon()
  registerIpcHandlers(services)
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
  void Promise.race([
    disposeAppServices(services, telemetryBridge),
    new Promise((resolve) => setTimeout(resolve, CLEANUP_TIMEOUT_MS))
  ]).finally(() => {
    quitAfterDeviceCleanup = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
