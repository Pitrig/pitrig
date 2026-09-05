import type { FirmwareUpdateState } from './firmware-update'
import type { ImageAssetState } from './image-assets'
import {
  BOARD_ID_VALUES,
  CONFIGURATION_SCHEMA_VERSION,
  MAXIMUM_PAYLOAD_SIZE
} from './configuration-schema'
import type {
  ApplicationConfiguration,
  BoardId,
  ConfigurationDocumentId
} from './configuration-schema'

export const DEVICE_LIST_PORTS_CHANNEL = 'device:list-ports' as const
export const DEVICE_GET_STATE_CHANNEL = 'device:get-state' as const
export const DEVICE_CONNECT_CHANNEL = 'device:connect' as const
export const DEVICE_AUTO_CONNECT_CHANNEL = 'device:auto-connect' as const
export const DEVICE_CANCEL_AUTO_CONNECT_CHANNEL = 'device:cancel-auto-connect' as const
export const DEVICE_DISCONNECT_CHANNEL = 'device:disconnect' as const
export const DEVICE_REBOOT_CHANNEL = 'device:reboot' as const
export const DEVICE_CONFIGURATION_READ_CHANNEL = 'device:configuration:read' as const
export const DEVICE_CONFIGURATION_APPLY_CHANNEL = 'device:configuration:apply' as const
export const DEVICE_CONFIGURATION_SAVE_CHANNEL = 'device:configuration:save' as const
export const DEVICE_CONFIGURATION_RESET_CHANNEL = 'device:configuration:reset' as const
export const DEVICE_STATE_CHANGED_CHANNEL = 'device:state-changed' as const

export const DEFAULT_BAUD_RATE = 921_600

export const SUPPORTED_BAUD_RATES = [
  9_600,
  19_200,
  38_400,
  57_600,
  115_200,
  230_400,
  460_800,
  DEFAULT_BAUD_RATE
] as const

export const AUTOMATIC_BAUD_RATES = [
  DEFAULT_BAUD_RATE,
  ...SUPPORTED_BAUD_RATES.filter((rate) => rate > DEFAULT_BAUD_RATE),
  ...SUPPORTED_BAUD_RATES.filter((rate) => rate < DEFAULT_BAUD_RATE).reverse()
] as const

export interface SerialPortSummary {
  id: string
  path: string
  displayName: string
  manufacturer?: string
  vendorId?: string
  productId?: string
  serialNumber?: string
}

export type DeviceStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error'

export type DeviceErrorCode =
  | 'busy'
  | 'cancelled'
  | 'configuration_rejected'
  | 'invalid_request'
  | 'multiple_devices'
  | 'no_device'
  | 'not_pitrig'
  | 'permission_denied'
  | 'port_busy'
  | 'port_missing'
  | 'serial_error'

export interface DeviceError {
  code: DeviceErrorCode
  message: string
}

export interface DeviceConnection {
  portId: string
  path: string
  displayName: string
  baudRate: number
}

export type PitrigBoardId = BoardId
export const PITRIG_BOARD_IDS = BOARD_ID_VALUES
export { CONFIGURATION_SCHEMA_VERSION }
export const MAXIMUM_CONFIGURATION_PAYLOAD_SIZE = MAXIMUM_PAYLOAD_SIZE

export interface DisplayDescriptor {
  width: number
  height: number
  configurable: false
}

export interface LedDescriptor {
  outputs: number
  pins: readonly number[]
}

export interface BoardProfile {
  display?: DisplayDescriptor
  telemetryUartBaudRate?: number
  transports: { uart: boolean; nativeUsbCdc: boolean }
  led: LedDescriptor
}

export const BOARD_PROFILES: Record<PitrigBoardId, BoardProfile> = {
  t_display_s3: {
    display: { width: 320, height: 170, configurable: false },
    transports: { uart: true, nativeUsbCdc: true },
    led: { outputs: 4, pins: [1, 2, 10, 11, 12, 13, 16, 17, 18, 21] }
  },
  guition_esp32_4848s040: {
    display: { width: 480, height: 480, configurable: false },
    telemetryUartBaudRate: 460_800,
    transports: { uart: true, nativeUsbCdc: false },
    led: { outputs: 4, pins: [1, 2, 40, 41, 42] }
  },
  guition_jc1060p470c: {
    display: { width: 1024, height: 600, configurable: false },
    transports: { uart: false, nativeUsbCdc: true },
    led: { outputs: 4, pins: [1, 2, 3, 4, 5, 20, 32, 33, 45, 46, 47] }
  },
  esp32s3_devkit: {
    transports: { uart: true, nativeUsbCdc: true },
    led: { outputs: 3, pins: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21] }
  }
}

export function hasDisplay(board: string): boolean {
  return BOARD_PROFILES[board as PitrigBoardId]?.display !== undefined
}

export function applyBoardTransportDefaults(
  configuration: ApplicationConfiguration
): ApplicationConfiguration {
  const baudRate = BOARD_PROFILES[configuration.board]?.telemetryUartBaudRate
  if (baudRate === undefined || configuration.telemetry_transport?.uart?.baud_rate !== undefined) {
    return configuration
  }
  return {
    ...configuration,
    telemetry_transport: {
      ...configuration.telemetry_transport,
      uart: { ...configuration.telemetry_transport?.uart, baud_rate: baudRate }
    }
  }
}

export type ConfigurationDocumentOutcome =
  | 'absent'
  | 'malformed_record'
  | 'unsupported_schema'
  | 'corrupt_payload'
  | 'rejected'
  | 'valid'

export interface ConfigurationDocumentState {
  outcome: ConfigurationDocumentOutcome
  generation: number
}

export type DeviceResetCause =
  | 'power_on'
  | 'software'
  | 'panic'
  | 'task_watchdog'
  | 'brownout'
  | 'other'

export type DeviceStartupPhase =
  | 'none'
  | 'configuration'
  | 'link'
  | 'display'
  | 'assets'
  | 'composition'
  | 'complete'

export interface DeviceHealth {
  safeMode: boolean
  bootFailures: number
  resetCause: DeviceResetCause
  lastPhase: DeviceStartupPhase
}

export interface DeviceInfo {
  boardId: PitrigBoardId
  firmwareVersion: string
  schemaVersion: typeof CONFIGURATION_SCHEMA_VERSION
  display?: DisplayDescriptor
  documents: Record<ConfigurationDocumentId, ConfigurationDocumentState>
  storageAvailable: boolean
  health?: DeviceHealth
}

export interface FontAssetDeviceInfo {
  storageAvailable: boolean
  packageAvailable: boolean
  formatVersion: number
  familyCount: number
  families: string[]
  packageSize: number
  payloadCrc?: number
  rebootRequired: boolean
}

export type DeviceConfiguration = ApplicationConfiguration

export interface DeviceSession {
  info: DeviceInfo
  configuration: DeviceConfiguration
  fontAssets?: FontAssetDeviceInfo
  imageAssets?: ImageAssetState
  firmware?: FirmwareUpdateState
}

export interface DeviceScanProgress {
  displayName: string
  baudRate: number
  attempt: number
  totalAttempts: number
}

export interface DeviceState {
  status: DeviceStatus
  connection?: DeviceConnection
  session?: DeviceSession
  scan?: DeviceScanProgress
  error?: DeviceError
}

export interface ConnectDeviceRequest {
  portId: string
  baudRate: number
}

export interface DeviceConfigurationRequest {
  json: string
  documents?: ConfigurationDocumentId[]
}

export interface DeviceConfigurationApplyResult {
  configuration: DeviceConfiguration
  documents: ConfigurationDocumentId[]
}

export interface DeviceConfigurationSaveResult {
  configuration: DeviceConfiguration
  documents: ConfigurationDocumentId[]
  rebootRequired: boolean
}

export interface DeviceConfigurationResetRequest {
  document?: ConfigurationDocumentId
}

export interface DeviceConfigurationResetResult {
  configuration: DeviceConfiguration
  documents: ConfigurationDocumentId[]
  rebootRequired: true
}

export type DeviceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeviceError }
