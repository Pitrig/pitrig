import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  DEVELOPMENT_SERIAL_TRAFFIC_CHANNEL,
  type SerialTrafficLog
} from '../shared/development'
import {
  DEVICE_AUTO_CONNECT_CHANNEL,
  DEVICE_CANCEL_AUTO_CONNECT_CHANNEL,
  DEVICE_CONNECT_CHANNEL,
  DEVICE_DISCONNECT_CHANNEL,
  DEVICE_GET_STATE_CHANNEL,
  DEVICE_LIST_PORTS_CHANNEL,
  DEVICE_STATE_CHANGED_CHANNEL,
  type DeviceState
} from '../shared/device'
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
