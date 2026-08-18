import { BrowserWindow } from 'electron'

/**
 * Sends one message to every live renderer window. Four of these existed, each
 * spelling out the same loop and the same destroyed-window guard around a
 * different channel constant.
 */
export function broadcastToWindows<T>(channel: string, payload: T): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}
