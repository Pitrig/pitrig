import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL,
  type SerialTrafficLog
} from '../shared/development'
import type { AssetUploadProgress } from '../shared/asset-upload'
import {
  IMAGE_CANCEL_UPLOAD_CHANNEL,
  IMAGE_CLEAR_CHANNEL,
  IMAGE_SELECT_SOURCE_CHANNEL,
  IMAGE_UPLOAD_CHANNEL,
  IMAGE_UPLOAD_PROGRESS_CHANNEL
} from '../shared/image-assets'
import {
  CONFIGURATION_FILE_LOAD_CHANNEL,
  CONFIGURATION_FILE_SAVE_CHANNEL
} from '../shared/configuration-files'
import {
  DEVICE_AUTO_CONNECT_CHANNEL,
  DEVICE_CANCEL_AUTO_CONNECT_CHANNEL,
  DEVICE_CONNECT_CHANNEL,
  DEVICE_CONFIGURATION_READ_CHANNEL,
  DEVICE_CONFIGURATION_RESET_CHANNEL,
  DEVICE_CONFIGURATION_APPLY_CHANNEL,
  DEVICE_CONFIGURATION_SAVE_CHANNEL,
  DEVICE_DISCONNECT_CHANNEL,
  DEVICE_GET_STATE_CHANNEL,
  DEVICE_LIST_PORTS_CHANNEL,
  DEVICE_STATE_CHANGED_CHANNEL,
  DEVICE_REBOOT_CHANNEL,
  type DeviceState
} from '../shared/device'
import {
  FIRMWARE_CANCEL_UPLOAD_CHANNEL,
  FIRMWARE_SELECT_SOURCE_CHANNEL,
  FIRMWARE_UPLOAD_CHANNEL,
  FIRMWARE_UPLOAD_PROGRESS_CHANNEL,
  type FirmwareUploadProgress
} from '../shared/firmware-update'
import {
  FONT_CANCEL_UPLOAD_CHANNEL,
  FONT_CLEAR_CHANNEL,
  FONT_SELECT_SOURCE_CHANNEL,
  FONT_UPLOAD_CHANNEL,
  FONT_UPLOAD_PROGRESS_CHANNEL,
  type FontUploadProgress
} from '../shared/font-assets'
import {
  APP_GET_INFO_CHANNEL,
  type SimCoreApi
} from '../shared/ipc'
import { PREVIEW_ASSETS_READ_CHANNEL } from '../shared/preview-assets'
import { SIMHUB_PROFILE_EXPORT_CHANNEL } from '../shared/simhub-profile'

const api: SimCoreApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL),
  loadConfigurationFile: () => ipcRenderer.invoke(CONFIGURATION_FILE_LOAD_CHANNEL),
  saveConfigurationFile: (request) =>
    ipcRenderer.invoke(CONFIGURATION_FILE_SAVE_CHANNEL, request),
  listSerialPorts: () => ipcRenderer.invoke(DEVICE_LIST_PORTS_CHANNEL),
  getDeviceState: () => ipcRenderer.invoke(DEVICE_GET_STATE_CHANNEL),
  connectDevice: (request) => ipcRenderer.invoke(DEVICE_CONNECT_CHANNEL, request),
  autoConnectDevice: () => ipcRenderer.invoke(DEVICE_AUTO_CONNECT_CHANNEL),
  cancelAutoConnect: () => ipcRenderer.invoke(DEVICE_CANCEL_AUTO_CONNECT_CHANNEL),
  disconnectDevice: () => ipcRenderer.invoke(DEVICE_DISCONNECT_CHANNEL),
  readDeviceConfiguration: () => ipcRenderer.invoke(DEVICE_CONFIGURATION_READ_CHANNEL),
  applyDeviceConfiguration: (request) =>
    ipcRenderer.invoke(DEVICE_CONFIGURATION_APPLY_CHANNEL, request),
  saveDeviceConfiguration: (request) =>
    ipcRenderer.invoke(DEVICE_CONFIGURATION_SAVE_CHANNEL, request),
  resetDeviceConfiguration: () => ipcRenderer.invoke(DEVICE_CONFIGURATION_RESET_CHANNEL),
  rebootDevice: () => ipcRenderer.invoke(DEVICE_REBOOT_CHANNEL),
  selectFontSource: () => ipcRenderer.invoke(FONT_SELECT_SOURCE_CHANNEL),
  uploadFontAssets: (request) => ipcRenderer.invoke(FONT_UPLOAD_CHANNEL, request),
  cancelFontUpload: () => ipcRenderer.invoke(FONT_CANCEL_UPLOAD_CHANNEL),
  clearFontAssets: () => ipcRenderer.invoke(FONT_CLEAR_CHANNEL),
  selectFirmwareSource: () => ipcRenderer.invoke(FIRMWARE_SELECT_SOURCE_CHANNEL),
  uploadFirmware: (request) => ipcRenderer.invoke(FIRMWARE_UPLOAD_CHANNEL, request),
  cancelFirmwareUpload: () => ipcRenderer.invoke(FIRMWARE_CANCEL_UPLOAD_CHANNEL),
  selectImageSource: () => ipcRenderer.invoke(IMAGE_SELECT_SOURCE_CHANNEL),
  uploadImageAssets: (request) => ipcRenderer.invoke(IMAGE_UPLOAD_CHANNEL, request),
  cancelImageUpload: () => ipcRenderer.invoke(IMAGE_CANCEL_UPLOAD_CHANNEL),
  clearImageAssets: () => ipcRenderer.invoke(IMAGE_CLEAR_CHANNEL),
  readPreviewAssets: () => ipcRenderer.invoke(PREVIEW_ASSETS_READ_CHANNEL),
  exportSimHubProfile: (request) =>
    ipcRenderer.invoke(SIMHUB_PROFILE_EXPORT_CHANNEL, request),
  onFirmwareUploadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: FirmwareUploadProgress): void =>
      listener(progress)
    ipcRenderer.on(FIRMWARE_UPLOAD_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(FIRMWARE_UPLOAD_PROGRESS_CHANNEL, handler)
  },
  onFontUploadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: FontUploadProgress): void =>
      listener(progress)
    ipcRenderer.on(FONT_UPLOAD_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(FONT_UPLOAD_PROGRESS_CHANNEL, handler)
  },
  onImageUploadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: AssetUploadProgress): void =>
      listener(progress)
    ipcRenderer.on(IMAGE_UPLOAD_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(IMAGE_UPLOAD_PROGRESS_CHANNEL, handler)
  },
  onDeviceStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: DeviceState): void => listener(state)
    ipcRenderer.on(DEVICE_STATE_CHANGED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(DEVICE_STATE_CHANGED_CHANNEL, handler)
  },
  ...(import.meta.env.DEV
    ? {
        onDevelopmentSerialTraffic: (listener: (log: SerialTrafficLog) => void) => {
          const handler = (_event: IpcRendererEvent, log: SerialTrafficLog): void => listener(log)
          ipcRenderer.on(DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL, handler)
          return () => ipcRenderer.removeListener(DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL, handler)
        }
      }
    : {})
}

contextBridge.exposeInMainWorld('simcore', api)
