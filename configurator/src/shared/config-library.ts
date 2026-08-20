import type { BoardId } from './configuration-schema'
import type { DeviceConfiguration } from './device'
import { LIBRARY_ID_PATTERN, libraryIdFor } from './library-id'

// Two ways to come back to a configuration you already have.
//
// The **library** is a folder of the application's own, one plain configuration
// document per file — no envelope, because unlike a template a saved
// configuration needs no name that the contract refuses to carry: the file name
// is the name. Listing it is therefore always accurate, and deleting from
// inside the app is safe.
//
// **Recent** is the other half: the files the author opened or saved through
// the system dialogs, wherever those live. Nothing is copied, so an entry can
// point at a file that has since moved — which is reported rather than hidden.

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

/** A saved configuration's identifier is its file's base name. */
export const configurationIdFor = libraryIdFor

/** What the library lists, without the cost of holding every document. */
export interface SavedConfigurationSummary {
  id: string
  name: string
  board: BoardId
  screenCount: number
  widgetCount: number
  sizeBytes: number
  /** Epoch milliseconds, so the list can be ordered by how recent it is. */
  modifiedAt: number
}

export interface RecentConfigurationEntry {
  path: string
  fileName: string
  openedAt: number
  /** The file is no longer where it was. The row offers to forget it. */
  missing: boolean
}

export interface ConfigurationLibrary {
  saved: SavedConfigurationSummary[]
  recent: RecentConfigurationEntry[]
  /**
   * Files in the library folder that could not be read or parsed, as one
   * number: a corrupt file is a visible gap rather than a listing that fails.
   */
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
