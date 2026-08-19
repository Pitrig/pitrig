import type { AssetResult, AssetUploadProgress } from './asset-upload'
import type { ImageSourceSelection, ImageUploadRequest } from './image-assets'
import type {
  ConnectDeviceRequest,
  DeviceConfigurationApplyResult,
  DeviceConfigurationRequest,
  DeviceConfigurationResetResult,
  DeviceConfigurationSaveResult,
  DeviceResult,
  DeviceState,
  SerialPortSummary
} from './device'
import type {
  FirmwareSourceSelection,
  FirmwareUpdateResult,
  FirmwareUploadProgress,
  FirmwareUploadRequest
} from './firmware-update'
import type {
  FontAssetResult,
  FontSourceSelection,
  FontUploadProgress,
  FontUploadRequest
} from './font-assets'
import type { SerialTrafficLog } from './development'
import type { PreviewAssets } from './preview-assets'
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
import type {
  DashboardTemplateDocument,
  DashboardTemplateLibrary,
  DashboardTemplateSummary,
  TemplateIdRequest,
  TemplateResult,
  TemplateSaveRequest
} from './templates'

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
  listDashboardTemplates: () => Promise<TemplateResult<DashboardTemplateLibrary>>
  readDashboardTemplate: (
    request: TemplateIdRequest
  ) => Promise<TemplateResult<DashboardTemplateDocument>>
  saveDashboardTemplate: (
    request: TemplateSaveRequest
  ) => Promise<TemplateResult<DashboardTemplateSummary>>
  deleteDashboardTemplate: (request: TemplateIdRequest) => Promise<TemplateResult<void>>
  listSerialPorts: () => Promise<DeviceResult<SerialPortSummary[]>>
  getDeviceState: () => Promise<DeviceState>
  connectDevice: (
    request: ConnectDeviceRequest
  ) => Promise<DeviceResult<DeviceState>>
  autoConnectDevice: () => Promise<DeviceResult<DeviceState>>
  cancelAutoConnect: () => Promise<DeviceResult<DeviceState>>
  disconnectDevice: () => Promise<DeviceResult<DeviceState>>
  readDeviceConfiguration: () => Promise<DeviceResult<DeviceState>>
  applyDeviceConfiguration: (
    request: DeviceConfigurationRequest
  ) => Promise<DeviceResult<DeviceConfigurationApplyResult>>
  saveDeviceConfiguration: (
    request: DeviceConfigurationRequest
  ) => Promise<DeviceResult<DeviceConfigurationSaveResult>>
  resetDeviceConfiguration: () => Promise<DeviceResult<DeviceConfigurationResetResult>>
  rebootDevice: () => Promise<DeviceResult<DeviceState>>
  selectFontSource: () => Promise<FontAssetResult<FontSourceSelection | null>>
  uploadFontAssets: (request: FontUploadRequest) => Promise<FontAssetResult<void>>
  cancelFontUpload: () => Promise<FontAssetResult<void>>
  clearFontAssets: () => Promise<DeviceResult<DeviceState>>
  selectFirmwareSource: () => Promise<FirmwareUpdateResult<FirmwareSourceSelection | null>>
  uploadFirmware: (request: FirmwareUploadRequest) => Promise<FirmwareUpdateResult<void>>
  cancelFirmwareUpload: () => Promise<FirmwareUpdateResult<void>>
  selectImageSource: () => Promise<AssetResult<ImageSourceSelection | null>>
  uploadImageAssets: (request: ImageUploadRequest) => Promise<AssetResult<void>>
  cancelImageUpload: () => Promise<AssetResult<void>>
  clearImageAssets: () => Promise<DeviceResult<DeviceState>>
  /** The uploaded faces and converted bitmaps the canvas draws with. */
  readPreviewAssets: () => Promise<PreviewAssets>
  exportSimHubProfile: (
    request: SimHubProfileExportRequest
  ) => Promise<SimHubProfileResult<SimHubProfileExportValue>>
  onFontUploadProgress: (listener: (progress: FontUploadProgress) => void) => () => void
  onImageUploadProgress: (listener: (progress: AssetUploadProgress) => void) => () => void
  onFirmwareUploadProgress: (
    listener: (progress: FirmwareUploadProgress) => void
  ) => () => void
  onDeviceStateChanged: (listener: (state: DeviceState) => void) => () => void
  onDevelopmentSerialTraffic?: (listener: (log: SerialTrafficLog) => void) => () => void
}
