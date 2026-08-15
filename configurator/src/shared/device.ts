import {
  BOARD_ID_VALUES,
  CONFIGURATION_SCHEMA_VERSION,
  MAXIMUM_PAYLOAD_SIZE
} from './configuration-schema'
import type { ApplicationConfiguration, BoardId } from './configuration-schema'
import type { FontAssetKey } from './font-assets'

export const DEVICE_LIST_PORTS_CHANNEL = 'device:list-ports' as const
export const DEVICE_GET_STATE_CHANNEL = 'device:get-state' as const
export const DEVICE_CONNECT_CHANNEL = 'device:connect' as const
export const DEVICE_AUTO_CONNECT_CHANNEL = 'device:auto-connect' as const
export const DEVICE_CANCEL_AUTO_CONNECT_CHANNEL = 'device:cancel-auto-connect' as const
export const DEVICE_DISCONNECT_CHANNEL = 'device:disconnect' as const
export const DEVICE_REBOOT_CHANNEL = 'device:reboot' as const
export const DEVICE_CONFIGURATION_READ_CHANNEL = 'device:configuration:read' as const
export const DEVICE_CONFIGURATION_VALIDATE_CHANNEL = 'device:configuration:validate' as const
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
  | 'not_simcore'
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

// The configuration contract itself is generated from
// configuration/configuration_schema.json. This module re-exports the parts the
// device layer speaks in so call sites keep one import, and adds only what the
// contract cannot know: the logical display size behind each board identifier.
export type SimCoreBoardId = BoardId
export const SIMCORE_BOARD_IDS = BOARD_ID_VALUES
export { CONFIGURATION_SCHEMA_VERSION }
export const MAXIMUM_CONFIGURATION_PAYLOAD_SIZE = MAXIMUM_PAYLOAD_SIZE

export interface DisplayDescriptor {
  width: number
  height: number
  configurable: false
}

export interface BoardProfile {
  display: DisplayDescriptor
}

export const BOARD_PROFILES: Record<SimCoreBoardId, BoardProfile> = {
  t_display_s3: {
    display: { width: 320, height: 170, configurable: false }
  },
  guition_esp32_4848s040: {
    display: { width: 480, height: 480, configurable: false }
  },
  guition_jc1060p470c: {
    display: { width: 1024, height: 600, configurable: false }
  }
}

export interface DeviceInfo {
  boardId: SimCoreBoardId
  firmwareVersion: string
  schemaVersion: typeof CONFIGURATION_SCHEMA_VERSION
  display: DisplayDescriptor
  configurationSource: 'factory' | 'slot_a' | 'slot_b'
  generation: number
  storageAvailable: boolean
}

export interface FontAssetDeviceInfo {
  storageAvailable: boolean
  packageAvailable: boolean
  formatVersion: number
  assetCount: number
  assets: FontAssetKey[]
  packageSize: number
  rebootRequired: boolean
}

export type DeviceConfiguration = ApplicationConfiguration

export interface DeviceSession {
  info: DeviceInfo
  configuration: DeviceConfiguration
  fontAssets?: FontAssetDeviceInfo
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
}

export interface DeviceConfigurationSaveResult {
  configuration: DeviceConfiguration
  rebootRequired: true
}

export interface DeviceConfigurationResetResult {
  configuration: DeviceConfiguration
  rebootRequired: true
}

export type DeviceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeviceError }
