import { BrowserWindow } from 'electron'

import { DEVICE_STATE_CHANGED_CHANNEL, type DeviceState } from '../../shared/device'
import {
  BOARD_UPDATE_PROGRESS_CHANNEL,
  FIRMWARE_UPLOAD_PROGRESS_CHANNEL,
  type BoardUpdateProgress,
  type FirmwareUploadProgress
} from '../../shared/firmware-update'
import {
  FIRST_INSTALL_PROGRESS_CHANNEL,
  type FirstInstallProgress
} from '../../shared/first-install'
import { FONT_LIBRARY_CHANGED_CHANNEL, type FontLibrarySnapshot } from '../../shared/font-library'
import {
  IMAGE_LIBRARY_CHANGED_CHANNEL,
  type ImageLibrarySnapshot
} from '../../shared/image-library'
import { SAVE_PROGRESS_CHANNEL, type SaveProgress } from '../../shared/save-to-board'

export function broadcastToWindows<T>(channel: string, payload: T): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(channel, payload)
    } catch {
      continue
    }
  }
}

export function broadcastFontLibraryChanged(snapshot: FontLibrarySnapshot): void {
  broadcastToWindows(FONT_LIBRARY_CHANGED_CHANNEL, snapshot)
}

export function broadcastImageLibraryChanged(snapshot: ImageLibrarySnapshot): void {
  broadcastToWindows(IMAGE_LIBRARY_CHANGED_CHANNEL, snapshot)
}

export function broadcastFirmwareUploadProgress(progress: FirmwareUploadProgress): void {
  broadcastToWindows(FIRMWARE_UPLOAD_PROGRESS_CHANNEL, progress)
}

export function broadcastBoardUpdateProgress(progress: BoardUpdateProgress): void {
  broadcastToWindows(BOARD_UPDATE_PROGRESS_CHANNEL, progress)
}

export function broadcastFirstInstallProgress(progress: FirstInstallProgress): void {
  broadcastToWindows(FIRST_INSTALL_PROGRESS_CHANNEL, progress)
}

export function broadcastSaveProgress(progress: SaveProgress): void {
  broadcastToWindows(SAVE_PROGRESS_CHANNEL, progress)
}

export function broadcastDeviceState(state: DeviceState): void {
  broadcastToWindows(DEVICE_STATE_CHANGED_CHANNEL, state)
}
