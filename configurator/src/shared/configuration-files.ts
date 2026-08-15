import type { DeviceConfiguration } from './device'

export const CONFIGURATION_FILE_LOAD_CHANNEL = 'configuration-file:load' as const
export const CONFIGURATION_FILE_SAVE_CHANNEL = 'configuration-file:save' as const
export const DEFAULT_CONFIGURATION_FILE_NAME = 'simcore-configuration.json'

export interface ConfigurationFileLoadValue {
  configuration: DeviceConfiguration
  fileName: string
}

export interface ConfigurationFileSaveRequest {
  json: string
}

export interface ConfigurationFileSaveValue {
  saved: boolean
  fileName?: string
}

export interface ConfigurationFileError {
  code: 'invalid_configuration' | 'read_failed' | 'write_failed'
  message: string
}

export type ConfigurationFileResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ConfigurationFileError }
