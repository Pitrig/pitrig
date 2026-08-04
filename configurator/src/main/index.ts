import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { DeviceService } from './device/device-service'
import {
  broadcastDevelopmentSerialTraffic,
  broadcastDeviceState,
  broadcastFontUploadProgress,
  registerIpcHandlers
} from './ipc/register-ipc-handlers'
import { FontAssetService } from './font-assets/font-asset-service'

const isDevelopment = import.meta.env.DEV
const deviceService = new DeviceService(
  broadcastDeviceState,
  isDevelopment ? broadcastDevelopmentSerialTraffic : undefined
)
const fontAssetService = new FontAssetService(deviceService, broadcastFontUploadProgress)
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
  registerIpcHandlers(deviceService, fontAssetService)
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
