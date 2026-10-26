import { ipcMain } from 'electron'

import {
  UPDATES_CHECK_CHANNEL,
  UPDATES_GET_STATUS_CHANNEL,
  UPDATES_INSTALL_APP_CHANNEL,
  UPDATES_INSTALL_PLUGIN_CHANNEL,
  UPDATES_OPEN_PAGE_CHANNEL,
  UPDATES_PREPARE_FIRMWARE_CHANNEL,
  UPDATES_STATUS_CHANNEL,
  type InstallPluginRequest,
  type InstallPluginResult,
  type OpenUpdatePageRequest
} from '../../shared/app-updates'
import type { DeviceService } from '../device/device-service'
import type { FirmwareUpdateService } from '../firmware-update/firmware-update-service'
import { broadcastToWindows } from '../ipc/broadcast'
import { UpdateService } from './update-service'
import { t } from '@shared/ui-text'

export function registerUpdates(
  deviceService: DeviceService,
  firmwareUpdateService: FirmwareUpdateService
): UpdateService {
  const service = new UpdateService(deviceService, firmwareUpdateService, (status) =>
    broadcastToWindows(UPDATES_STATUS_CHANNEL, status)
  )
  ipcMain.handle(UPDATES_GET_STATUS_CHANNEL, () => service.status())
  ipcMain.handle(UPDATES_CHECK_CHANNEL, () => service.check())
  ipcMain.handle(UPDATES_INSTALL_APP_CHANNEL, () => service.installApp())
  ipcMain.handle(UPDATES_OPEN_PAGE_CHANNEL, async (_event, request: unknown) => {
    if (isOpenPageRequest(request)) await service.openPage(request.page)
  })
  ipcMain.handle(UPDATES_PREPARE_FIRMWARE_CHANNEL, () => service.prepareFirmware())
  ipcMain.handle(UPDATES_INSTALL_PLUGIN_CHANNEL, (_event, request: unknown) => {
    if (isInstallPluginRequest(request)) return service.installPlugin(request.closeSimHub)
    const result: InstallPluginResult = {
      outcome: 'failed',
      message: t('updates.simhub.invalidRequest')
    }
    return result
  })
  return service
}

function isOpenPageRequest(value: unknown): value is OpenUpdatePageRequest {
  const page = (value as Partial<OpenUpdatePageRequest> | null)?.page
  return page === 'release' || page === 'simhub'
}

function isInstallPluginRequest(value: unknown): value is InstallPluginRequest {
  return typeof (value as Partial<InstallPluginRequest> | null)?.closeSimHub === 'boolean'
}
