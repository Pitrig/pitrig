import type { AssetResult } from './asset-upload'
import type { UsageSetRequest, UsageSettings } from './usage'
import type { ImageSourceSelection } from './image-assets'
import type {
  ImageLibraryAddRequest,
  ImageLibraryEntry,
  ImageLibraryIdRequest,
  ImageLibrarySnapshot
} from './image-library'
import type {
  DashboardFileResult,
  DashboardShareRequest,
  DashboardShareSaveValue,
  DashboardShareSummary,
  OpenedDashboard
} from './dashboard-files'
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
  InstallPluginRequest,
  InstallPluginResult,
  OpenUpdatePageRequest,
  PrepareFirmwareResult,
  UpdateStatus
} from './app-updates'
import type {
  BoardUpdateProgress,
  BoardUpdateRequest,
  BoardUpdateResult,
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
  PluginInput,
  TelemetryBridgeStartRequest,
  TelemetryBridgeStatus,
  TelemetryInterest,
  TelemetrySimulation,
  TelemetrySnapshot
} from './telemetry-bridge'
import type {
  TemplateIdRequest,
  TemplateLibrary,
  TemplateReadValue,
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

export interface PitrigApi {
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
  readTemplate: (request: TemplateIdRequest) => Promise<TemplateResult<TemplateReadValue>>
  adoptTemplate: (request: TemplateIdRequest) => Promise<TemplateResult<OpenedDashboard>>
  openTemplateCredit: (request: TemplateIdRequest) => Promise<boolean>
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
  updateBoard: (request: BoardUpdateRequest) => Promise<BoardUpdateResult>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  installAppUpdate: () => Promise<boolean>
  openUpdatePage: (request: OpenUpdatePageRequest) => Promise<void>
  prepareReleaseFirmware: () => Promise<PrepareFirmwareResult>
  installSimHubPlugin: (request: InstallPluginRequest) => Promise<InstallPluginResult>
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => () => void
  getUsageSettings: () => Promise<UsageSettings>
  setUsageSettings: (request: UsageSetRequest) => Promise<UsageSettings>
  selectImageSource: () => Promise<AssetResult<ImageSourceSelection | null>>
  cancelImageUpload: () => Promise<AssetResult<void>>
  clearImageAssets: () => Promise<DeviceResult<DeviceState>>
  readPreviewAssets: () => Promise<PreviewAssets>
  listImageLibrary: () => Promise<ImageLibrarySnapshot>
  addImagesToLibrary: (
    request: ImageLibraryAddRequest
  ) => Promise<AssetResult<ImageLibraryEntry[]>>
  removeLibraryImage: (request: ImageLibraryIdRequest) => Promise<AssetResult<boolean>>
  onImageLibraryChanged: (listener: (snapshot: ImageLibrarySnapshot) => void) => () => void
  inspectDashboardShare: (request: {
    json: string
  }) => Promise<DashboardFileResult<DashboardShareSummary>>
  saveDashboardShare: (
    request: DashboardShareRequest
  ) => Promise<DashboardFileResult<DashboardShareSaveValue>>
  onFirmwareUploadProgress: (
    listener: (progress: FirmwareUploadProgress) => void
  ) => () => void
  onBoardUpdateProgress: (listener: (progress: BoardUpdateProgress) => void) => () => void
  onSaveProgress: (listener: (progress: SaveProgress) => void) => () => void
  onFontLibraryChanged: (listener: (snapshot: FontLibrarySnapshot) => void) => () => void
  onDeviceStateChanged: (listener: (state: DeviceState) => void) => () => void
  telemetryBridge: TelemetryBridgeApi
}

export interface TelemetryBridgeApi {
  getStatus: () => Promise<TelemetryBridgeStatus>
  start: (request: TelemetryBridgeStartRequest) => Promise<DeviceResult<TelemetryBridgeStatus>>
  setInterest: (interest: TelemetryInterest) => Promise<void>
  simulate: (simulation: TelemetrySimulation) => Promise<void>
  onStatus: (listener: (status: TelemetryBridgeStatus) => void) => () => void
  onSnapshot: (listener: (snapshot: TelemetrySnapshot) => void) => () => void
  onInput: (listener: (input: PluginInput) => void) => () => void
}
