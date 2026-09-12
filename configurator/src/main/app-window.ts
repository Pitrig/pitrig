import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  const home =
    development && process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : pathToFileURL(join(__dirname, options.renderer)).toString()
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
  denyForeignContent(window, home)

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('render-process-gone', JSON.stringify(details))
    if (details.reason === 'clean-exit' || window.isDestroyed()) return
    void window.loadURL(home)
  })

  void window.loadURL(home)
  return window
}

function denyForeignContent(window: BrowserWindow, home: string): void {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isHome(url, home)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
}

function isHome(url: string, home: string): boolean {
  try {
    const target = new URL(url)
    const allowed = new URL(home)
    return (
      target.origin === allowed.origin &&
      (target.protocol !== 'file:' || target.pathname === allowed.pathname)
    )
  } catch {
    return false
  }
}
