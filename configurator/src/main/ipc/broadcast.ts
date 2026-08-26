import { BrowserWindow } from 'electron'

export function broadcastToWindows<T>(channel: string, payload: T): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}
