import { contextBridge, ipcRenderer } from 'electron'

import {
  APP_GET_INFO_CHANNEL,
  type SimCoreApi
} from '../shared/ipc'

const api: SimCoreApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL)
}

contextBridge.exposeInMainWorld('simcore', api)
