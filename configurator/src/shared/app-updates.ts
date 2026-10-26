import { CONFIGURATION_SCHEMA_VERSION } from './configuration-schema'
import type { DeviceSession } from './device'
import type { FirmwareSourceSelection, FirmwareUpdateResult } from './firmware-update'
import { compareVersions } from './version-compare'

export const UPDATES_GET_STATUS_CHANNEL = 'updates:get-status' as const
export const UPDATES_CHECK_CHANNEL = 'updates:check' as const
export const UPDATES_INSTALL_APP_CHANNEL = 'updates:install-app' as const
export const UPDATES_OPEN_PAGE_CHANNEL = 'updates:open-page' as const
export const UPDATES_PREPARE_FIRMWARE_CHANNEL = 'updates:prepare-firmware' as const
export const UPDATES_INSTALL_PLUGIN_CHANNEL = 'updates:install-plugin' as const
export const UPDATES_STATUS_CHANNEL = 'updates:status' as const

export const SIMHUB_MINIMUM_VERSION = '9.12.4'

export type AppUpdateState =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'failed'

export interface AppUpdateStatus {
  current: string
  latest?: string
  state: AppUpdateState
  installable: boolean
  progress?: number
  error?: string
}

export interface SimHubStatus {
  version?: string
  tooOld: boolean
  running: boolean
  plugin?: string
  bundledPlugin?: string
  pluginState: 'current' | 'missing' | 'stale' | 'unknown'
}

export interface UpdateStatus {
  enabled: boolean
  checkedAt?: number
  app: AppUpdateStatus
  releasedFirmware: string
  firmwareDownload?: number
  simhub?: SimHubStatus
}

export type UpdatePage = 'release' | 'simhub'

export interface OpenUpdatePageRequest {
  page: UpdatePage
}

export interface InstallPluginRequest {
  closeSimHub: boolean
}

export type InstallPluginOutcome = 'installed' | 'simhub_running' | 'failed'

export interface InstallPluginResult {
  outcome: InstallPluginOutcome
  message?: string
}

export type PrepareFirmwareResult = FirmwareUpdateResult<FirmwareSourceSelection>

export function boardBehind(session: DeviceSession | undefined, released: string): boolean {
  if (!session?.firmware?.storageAvailable) return false
  const schema = session.info.schemaVersion
  if (schema !== CONFIGURATION_SCHEMA_VERSION) return schema < CONFIGURATION_SCHEMA_VERSION
  return compareVersions(session.info.firmwareVersion, released) === -1
}
