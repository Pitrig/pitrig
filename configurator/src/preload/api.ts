import { ipcRenderer, type IpcRendererEvent } from 'electron'

import {
  CONFIG_LIBRARY_DELETE_CHANNEL,
  CONFIG_LIBRARY_LIST_CHANNEL,
  CONFIG_LIBRARY_READ_CHANNEL,
  CONFIG_LIBRARY_SAVE_CHANNEL,
  CONFIG_RECENT_FORGET_CHANNEL,
  CONFIG_RECENT_READ_CHANNEL
} from '../shared/config-library'
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
  FONT_CLEAR_CHANNEL
} from '../shared/font-assets'
import {
  FONT_CATALOG_LIST_CHANNEL,
  FONT_CATALOG_PREVIEW_CHANNEL,
  FONT_LIBRARY_ADD_CHANNEL,
  FONT_LIBRARY_CHANGED_CHANNEL,
  FONT_LIBRARY_FACES_CHANNEL,
  FONT_LIBRARY_IMPORT_CHANNEL,
  FONT_LIBRARY_LIST_CHANNEL,
  FONT_LIBRARY_REMOVE_CHANNEL,
  type FontLibrarySnapshot
} from '../shared/font-library'
import {
  APP_GET_INFO_CHANNEL,
  type SimCoreApi
} from '../shared/ipc'
import {
  SAVE_PROGRESS_CHANNEL,
  SAVE_TO_BOARD_CHANNEL,
  type SaveProgress
} from '../shared/save-to-board'
import { PREVIEW_ASSETS_READ_CHANNEL } from '../shared/preview-assets'
import { SIMHUB_PROFILE_EXPORT_CHANNEL } from '../shared/simhub-profile'
import {
  TEMPLATE_DELETE_CHANNEL,
  TEMPLATE_LIST_CHANNEL,
  TEMPLATE_READ_CHANNEL,
  TEMPLATE_SAVE_CHANNEL
} from '../shared/templates'

export const productApi: SimCoreApi = {
  getAppInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL),
  loadConfigurationFile: () => ipcRenderer.invoke(CONFIGURATION_FILE_LOAD_CHANNEL),
  saveConfigurationFile: (request) =>
    ipcRenderer.invoke(CONFIGURATION_FILE_SAVE_CHANNEL, request),
  listConfigurations: () => ipcRenderer.invoke(CONFIG_LIBRARY_LIST_CHANNEL),
  readSavedConfiguration: (request) => ipcRenderer.invoke(CONFIG_LIBRARY_READ_CHANNEL, request),
  saveConfigurationToLibrary: (request) =>
    ipcRenderer.invoke(CONFIG_LIBRARY_SAVE_CHANNEL, request),
  deleteSavedConfiguration: (request) => ipcRenderer.invoke(CONFIG_LIBRARY_DELETE_CHANNEL, request),
  readRecentConfiguration: (request) => ipcRenderer.invoke(CONFIG_RECENT_READ_CHANNEL, request),
  forgetRecentConfiguration: (request) =>
    ipcRenderer.invoke(CONFIG_RECENT_FORGET_CHANNEL, request),
  listTemplates: () => ipcRenderer.invoke(TEMPLATE_LIST_CHANNEL),
  readTemplate: (request) => ipcRenderer.invoke(TEMPLATE_READ_CHANNEL, request),
  saveTemplate: (request) => ipcRenderer.invoke(TEMPLATE_SAVE_CHANNEL, request),
  deleteTemplate: (request) => ipcRenderer.invoke(TEMPLATE_DELETE_CHANNEL, request),
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
  saveToBoard: (request) => ipcRenderer.invoke(SAVE_TO_BOARD_CHANNEL, request),
  resetDeviceConfiguration: (request) =>
    ipcRenderer.invoke(DEVICE_CONFIGURATION_RESET_CHANNEL, request),
  rebootDevice: () => ipcRenderer.invoke(DEVICE_REBOOT_CHANNEL),
  listFontLibrary: () => ipcRenderer.invoke(FONT_LIBRARY_LIST_CHANNEL),
  readFontFaces: (request) => ipcRenderer.invoke(FONT_LIBRARY_FACES_CHANNEL, request),
  importFontFace: (request) => ipcRenderer.invoke(FONT_LIBRARY_IMPORT_CHANNEL, request),
  removeFontFace: (request) => ipcRenderer.invoke(FONT_LIBRARY_REMOVE_CHANNEL, request),
  listFontCatalog: () => ipcRenderer.invoke(FONT_CATALOG_LIST_CHANNEL),
  previewFontCatalogFace: (request) => ipcRenderer.invoke(FONT_CATALOG_PREVIEW_CHANNEL, request),
  addFontFromCatalog: (request) => ipcRenderer.invoke(FONT_LIBRARY_ADD_CHANNEL, request),
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
  onImageUploadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: AssetUploadProgress): void =>
      listener(progress)
    ipcRenderer.on(IMAGE_UPLOAD_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(IMAGE_UPLOAD_PROGRESS_CHANNEL, handler)
  },
  onSaveProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: SaveProgress): void => listener(progress)
    ipcRenderer.on(SAVE_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SAVE_PROGRESS_CHANNEL, handler)
  },
  onFontLibraryChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, snapshot: FontLibrarySnapshot): void =>
      listener(snapshot)
    ipcRenderer.on(FONT_LIBRARY_CHANGED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(FONT_LIBRARY_CHANGED_CHANNEL, handler)
  },
  onDeviceStateChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, state: DeviceState): void => listener(state)
    ipcRenderer.on(DEVICE_STATE_CHANGED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(DEVICE_STATE_CHANGED_CHANNEL, handler)
  }
}
