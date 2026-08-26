import type { BoardId } from './configuration-schema'
import type { DeviceConfiguration } from './device'
import { LIBRARY_ID_PATTERN, libraryIdFor } from './library-id'

export const CONFIG_LIBRARY_LIST_CHANNEL = 'configs:list' as const
export const CONFIG_LIBRARY_READ_CHANNEL = 'configs:read' as const
export const CONFIG_LIBRARY_SAVE_CHANNEL = 'configs:save' as const
export const CONFIG_LIBRARY_DELETE_CHANNEL = 'configs:delete' as const
export const CONFIG_RECENT_READ_CHANNEL = 'configs:read-recent' as const
export const CONFIG_RECENT_FORGET_CHANNEL = 'configs:forget-recent' as const

export const CONFIGURATION_ID_PATTERN = LIBRARY_ID_PATTERN
export const MAXIMUM_CONFIGURATION_NAME = 64
export const MAXIMUM_SAVED_CONFIGURATIONS = 64
export const MAXIMUM_RECENT_CONFIGURATIONS = 12

export const configurationIdFor = libraryIdFor

export interface SavedConfigurationSummary {
  id: string
  name: string
  board: BoardId
  screenCount: number
  widgetCount: number
  sizeBytes: number
  modifiedAt: number
}

export interface RecentConfigurationEntry {
  path: string
  fileName: string
  openedAt: number
  missing: boolean
}

export interface ConfigurationLibrary {
  saved: SavedConfigurationSummary[]
  recent: RecentConfigurationEntry[]
  unreadable: number
}

export interface SavedConfigurationDocument {
  name: string
  configuration: DeviceConfiguration
}

export interface ConfigurationSaveRequest {
  name: string
  json: string
}

export interface ConfigurationIdRequest {
  id: string
}

export interface ConfigurationPathRequest {
  path: string
}

export interface RecentConfigurationValue {
  configuration: DeviceConfiguration
  fileName: string
}

export interface ConfigLibraryError {
  code:
    | 'invalid_configuration'
    | 'not_found'
    | 'read_failed'
    | 'write_failed'
    | 'limit_reached'
  message: string
}

export type ConfigLibraryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ConfigLibraryError }
