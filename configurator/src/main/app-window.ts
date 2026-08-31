import { BrowserWindow } from 'electron'
import { join } from 'node:path'

import { appIcon } from './branding'

export interface AppWindowOptions {
  preload: string
  renderer: string
  width?: number
  height?: number
}

export function isDevelopment(): boolean {
  return import.meta.env.DEV
}

export function createAppWindow(options: AppWindowOptions): BrowserWindow {
  const development = isDevelopment()
  const window = new BrowserWindow({
    icon: appIcon(),
    width: options.width ?? 1280,
    height: options.height ?? 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: development
    }
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[probe] render-process-gone', JSON.stringify(details))
  })

  if (development && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, options.renderer))
  }
  return window
}
