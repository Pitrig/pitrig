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
import type { ControlCommandRequest, ControlCommandResult, SerialTrafficLog } from './debug'
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
  /** The saved-configuration folder and the recent-files list, in one read. */
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
  /** Dashboards to start from, and widgets to reuse inside one. */
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
  /** Resolve fonts, install what the board lacks, save, restart, reconnect. */
  saveToBoard: (request: SaveToBoardRequest) => Promise<SaveToBoardResult>
  resetDeviceConfiguration: (
    request?: DeviceConfigurationResetRequest
  ) => Promise<DeviceResult<DeviceConfigurationResetResult>>
  rebootDevice: () => Promise<DeviceResult<DeviceState>>
  /** One hand-typed `@SC:` line, and the lines the board answered with. */
  sendControlCommand: (request: ControlCommandRequest) => Promise<ControlCommandResult>
  listFontLibrary: () => Promise<FontLibrarySnapshot>
  /** Face bytes for the ids the canvas is about to draw with. */
  readFontFaces: (request: FontFacesRequest) => Promise<FontFaceBytes[]>
  importFontFace: (
    request: FontLibraryImportRequest
  ) => Promise<FontLibraryResult<FontLibraryEntry | null>>
  removeFontFace: (request: FontLibraryIdRequest) => Promise<FontLibraryResult<void>>
  /** Every family the checked-in Google Fonts catalog offers. Face URLs stay in main. */
  listFontCatalog: () => Promise<FontCatalogFamily[]>
  /** One catalog family's first face, so a picker row can draw itself. */
  previewFontCatalogFace: (
    request: FontCatalogPreviewRequest
  ) => Promise<FontCatalogPreview | null>
  /** Downloads one catalog face and puts it in the library. */
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
  /** The converted bitmaps the canvas draws with. Faces come from the library. */
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
  /** Every byte over the link, for the debug workspace. Present in every build. */
  onSerialTraffic: (listener: (log: SerialTrafficLog) => void) => () => void
}
