import type { AssetResult, AssetUploadProgress } from './asset-upload'
import type { ImageSourceSelection, ImageUploadRequest } from './image-assets'
import type {
  ConnectDeviceRequest,
  DeviceConfigurationApplyResult,
  DeviceConfigurationRequest,
  DeviceConfigurationResetRequest,
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
import type { FontAssetResult } from './font-assets'
import type {
  FontCatalogFamily,
  FontCatalogPreview,
  FontCatalogPreviewRequest,
  FontFaceBytes,
  FontFacesRequest,
  FontLibraryAddRequest,
  FontLibraryEntry,
  FontLibraryIdRequest,
  FontLibraryImportRequest,
  FontLibraryResult,
  FontLibrarySnapshot
} from './font-library'
import type {
  SaveProgress,
  SaveToBoardRequest,
  SaveToBoardResult
} from './save-to-board'
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
  ConfigLibraryResult,
  ConfigurationIdRequest,
  ConfigurationLibrary,
  ConfigurationPathRequest,
  ConfigurationSaveRequest,
  RecentConfigurationValue,
  SavedConfigurationDocument,
  SavedConfigurationSummary
} from './config-library'
import type {
  TemplateDocument,
  TemplateIdRequest,
  TemplateLibrary,
  TemplateResult,
  TemplateSaveRequest,
  TemplateSummary
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
  listConfigurations: () => Promise<ConfigLibraryResult<ConfigurationLibrary>>
  readSavedConfiguration: (
    request: ConfigurationIdRequest
  ) => Promise<ConfigLibraryResult<SavedConfigurationDocument>>
  saveConfigurationToLibrary: (
    request: ConfigurationSaveRequest
  ) => Promise<ConfigLibraryResult<SavedConfigurationSummary>>
  deleteSavedConfiguration: (request: ConfigurationIdRequest) => Promise<ConfigLibraryResult<void>>
  readRecentConfiguration: (
    request: ConfigurationPathRequest
  ) => Promise<ConfigLibraryResult<RecentConfigurationValue>>
  forgetRecentConfiguration: (
    request: ConfigurationPathRequest
  ) => Promise<ConfigLibraryResult<void>>
  listTemplates: () => Promise<TemplateResult<TemplateLibrary>>
  readTemplate: (request: TemplateIdRequest) => Promise<TemplateResult<TemplateDocument>>
  saveTemplate: (request: TemplateSaveRequest) => Promise<TemplateResult<TemplateSummary>>
  deleteTemplate: (request: TemplateIdRequest) => Promise<TemplateResult<void>>
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
  saveToBoard: (request: SaveToBoardRequest) => Promise<SaveToBoardResult>
  resetDeviceConfiguration: (
    request?: DeviceConfigurationResetRequest
  ) => Promise<DeviceResult<DeviceConfigurationResetResult>>
  rebootDevice: () => Promise<DeviceResult<DeviceState>>
  listFontLibrary: () => Promise<FontLibrarySnapshot>
  readFontFaces: (request: FontFacesRequest) => Promise<FontFaceBytes[]>
  importFontFace: (
    request: FontLibraryImportRequest
  ) => Promise<FontLibraryResult<FontLibraryEntry | null>>
  removeFontFace: (request: FontLibraryIdRequest) => Promise<FontLibraryResult<void>>
  listFontCatalog: () => Promise<FontCatalogFamily[]>
  previewFontCatalogFace: (
    request: FontCatalogPreviewRequest
  ) => Promise<FontCatalogPreview | null>
  addFontFromCatalog: (
    request: FontLibraryAddRequest
  ) => Promise<FontLibraryResult<FontLibraryEntry>>
  cancelFontUpload: () => Promise<FontAssetResult<void>>
  clearFontAssets: () => Promise<DeviceResult<DeviceState>>
  selectFirmwareSource: () => Promise<FirmwareUpdateResult<FirmwareSourceSelection | null>>
  uploadFirmware: (request: FirmwareUploadRequest) => Promise<FirmwareUpdateResult<void>>
  cancelFirmwareUpload: () => Promise<FirmwareUpdateResult<void>>
  selectImageSource: () => Promise<AssetResult<ImageSourceSelection | null>>
  uploadImageAssets: (request: ImageUploadRequest) => Promise<AssetResult<void>>
  cancelImageUpload: () => Promise<AssetResult<void>>
  clearImageAssets: () => Promise<DeviceResult<DeviceState>>
  readPreviewAssets: () => Promise<PreviewAssets>
  exportSimHubProfile: (
    request: SimHubProfileExportRequest
  ) => Promise<SimHubProfileResult<SimHubProfileExportValue>>
  onImageUploadProgress: (listener: (progress: AssetUploadProgress) => void) => () => void
  onFirmwareUploadProgress: (
    listener: (progress: FirmwareUploadProgress) => void
  ) => () => void
  onSaveProgress: (listener: (progress: SaveProgress) => void) => () => void
  onFontLibraryChanged: (listener: (snapshot: FontLibrarySnapshot) => void) => () => void
  onDeviceStateChanged: (listener: (state: DeviceState) => void) => () => void
}
