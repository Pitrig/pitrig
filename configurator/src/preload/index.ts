import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL,
  type SerialTrafficLog
} from '../shared/development'
import {
  DEVICE_AUTO_CONNECT_CHANNEL,
  DEVICE_CANCEL_AUTO_CONNECT_CHANNEL,
  DEVICE_CONNECT_CHANNEL,
  DEVICE_CONFIGURATION_READ_CHANNEL,
  DEVICE_CONFIGURATION_RESET_CHANNEL,
  DEVICE_CONFIGURATION_SAVE_CHANNEL,
  DEVICE_CONFIGURATION_VALIDATE_CHANNEL,
  DEVICE_DISCONNECT_CHANNEL,
  DEVICE_GET_STATE_CHANNEL,
  DEVICE_LIST_PORTS_CHANNEL,
  DEVICE_STATE_CHANGED_CHANNEL,
  DEVICE_REBOOT_CHANNEL,
  type DeviceState
} from '../shared/device'
import {
  FONT_CANCEL_UPLOAD_CHANNEL,
  FONT_SELECT_SOURCE_CHANNEL,
  FONT_UPLOAD_CHANNEL,
  FONT_UPLOAD_PROGRESS_CHANNEL,
  type FontUploadProgress
} from '../shared/font-assets'
import {
  APP_GET_INFO_CHANNEL,
  type SimCoreApi
} from '../shared/ipc'

const api: SimCoreApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL),
  listSerialPorts: () => ipcRenderer.invoke(DEVICE_LIST_PORTS_CHANNEL),
  getDeviceState: () => ipcRenderer.invoke(DEVICE_GET_STATE_CHANNEL),
  connectDevice: (request) => ipcRenderer.invoke(DEVICE_CONNECT_CHANNEL, request),
  autoConnectDevice: () => ipcRenderer.invoke(DEVICE_AUTO_CONNECT_CHANNEL),
  cancelAutoConnect: () => ipcRenderer.invoke(DEVICE_CANCEL_AUTO_CONNECT_CHANNEL),
  disconnectDevice: () => ipcRenderer.invoke(DEVICE_DISCONNECT_CHANNEL),
  readDeviceConfiguration: () => ipcRenderer.invoke(DEVICE_CONFIGURATION_READ_CHANNEL),
  validateDeviceConfiguration: (request) =>
    ipcRenderer.invoke(DEVICE_CONFIGURATION_VALIDATE_CHANNEL, request),
  saveDeviceConfiguration: (request) =>
    ipcRenderer.invoke(DEVICE_CONFIGURATION_SAVE_CHANNEL, request),
  resetDeviceConfiguration: () => ipcRenderer.invoke(DEVICE_CONFIGURATION_RESET_CHANNEL),
  rebootDevice: () => ipcRenderer.invoke(DEVICE_REBOOT_CHANNEL),
  selectFontSource: () => ipcRenderer.invoke(FONT_SELECT_SOURCE_CHANNEL),
  uploadFontAssets: (request) => ipcRenderer.invoke(FONT_UPLOAD_CHANNEL, request),
  cancelFontUpload: () => ipcRenderer.invoke(FONT_CANCEL_UPLOAD_CHANNEL),
  onFontUploadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: FontUploadProgress): void =>
      listener(progress)
    ipcRenderer.on(FONT_UPLOAD_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(FONT_UPLOAD_PROGRESS_CHANNEL, handler)
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
