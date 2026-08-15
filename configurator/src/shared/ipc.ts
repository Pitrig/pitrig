import type {
  ConnectDeviceRequest,
  DeviceConfigurationRequest,
  DeviceConfigurationResetResult,
  DeviceConfigurationSaveResult,
  DeviceConfiguration,
  DeviceResult,
  DeviceState,
  SerialPortSummary
} from './device'
import type {
  FontAssetResult,
  FontSourceSelection,
  FontUploadProgress,
  FontUploadRequest
} from './font-assets'
import type { SerialTrafficLog } from './development'
import type {
  ConfigurationFileLoadValue,
  ConfigurationFileResult,
  ConfigurationFileSaveRequest,
  ConfigurationFileSaveValue
} from './configuration-files'
import type {
  SimHubProfileExportRequest,
  SimHubProfileExportValue,
  SimHubProfileResult
} from './simhub-profile'

export const APP_GET_INFO_CHANNEL = 'app:get-info' as const

export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface SimCoreApi {
  getAppInfo: () => Promise<AppInfo>
  loadConfigurationFile: () => Promise<ConfigurationFileResult<ConfigurationFileLoadValue | null>>
  saveConfigurationFile: (
    request: ConfigurationFileSaveRequest
  ) => Promise<ConfigurationFileResult<ConfigurationFileSaveValue>>
  listSerialPorts: () => Promise<DeviceResult<SerialPortSummary[]>>
  getDeviceState: () => Promise<DeviceState>
  connectDevice: (
    request: ConnectDeviceRequest
  ) => Promise<DeviceResult<DeviceState>>
  autoConnectDevice: () => Promise<DeviceResult<DeviceState>>
  cancelAutoConnect: () => Promise<DeviceResult<DeviceState>>
  disconnectDevice: () => Promise<DeviceResult<DeviceState>>
  readDeviceConfiguration: () => Promise<DeviceResult<DeviceState>>
  validateDeviceConfiguration: (
    request: DeviceConfigurationRequest
  ) => Promise<DeviceResult<DeviceConfiguration>>
  saveDeviceConfiguration: (
    request: DeviceConfigurationRequest
  ) => Promise<DeviceResult<DeviceConfigurationSaveResult>>
  resetDeviceConfiguration: () => Promise<DeviceResult<DeviceConfigurationResetResult>>
  rebootDevice: () => Promise<DeviceResult<DeviceState>>
  selectFontSource: () => Promise<FontAssetResult<FontSourceSelection | null>>
  uploadFontAssets: (request: FontUploadRequest) => Promise<FontAssetResult<void>>
  cancelFontUpload: () => Promise<FontAssetResult<void>>
  clearFontAssets: () => Promise<DeviceResult<DeviceState>>
  exportSimHubProfile: (
    request: SimHubProfileExportRequest
  ) => Promise<SimHubProfileResult<SimHubProfileExportValue>>
  onFontUploadProgress: (listener: (progress: FontUploadProgress) => void) => () => void
  onDeviceStateChanged: (listener: (state: DeviceState) => void) => () => void
  onDevelopmentSerialTraffic?: (listener: (log: SerialTrafficLog) => void) => () => void
}
