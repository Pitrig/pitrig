import type { FirmwareUpdateState } from './firmware-update'
import type { ImageAssetState } from './image-assets'
import {
  BOARD_ID_VALUES,
  CONFIGURATION_SCHEMA_VERSION,
  MAXIMUM_PAYLOAD_SIZE
} from './configuration-schema'
import type { ApplicationConfiguration, BoardId } from './configuration-schema'

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
  /**
   * Written into a document for this board instead of being left to the
   * contract default of 921600. A sparse document is never expanded through a
   * board profile, so a rate a board cannot hold has to travel in the document
   * itself. Absent means the contract default stands.
   */
  telemetryUartBaudRate?: number
}

export const BOARD_PROFILES: Record<SimCoreBoardId, BoardProfile> = {
  t_display_s3: {
    display: { width: 320, height: 170, configurable: false }
  },
  guition_esp32_4848s040: {
    display: { width: 480, height: 480, configurable: false },
    // The only board whose telemetry runs over UART by default, and it reaches
    // the PC through the same CH340 bridge it is flashed over. That bridge does
    // not hold 921600 on this host: esptool cannot even verify the flash chip
    // after switching to it, so telemetry and `@SC:` would fare no better.
    telemetryUartBaudRate: 460_800
  },
  guition_jc1060p470c: {
    display: { width: 1024, height: 600, configurable: false }
  }
}

/**
 * Fills in the transport properties the contract default cannot supply for a
 * board, leaving an authored value alone. Called wherever a document is created
 * or moved onto a board — the document is the only carrier, because firmware
 * expands an omitted property the same way for every board.
 */
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
  familyCount: number
  // Installed faces. Every pixel size is rasterized from them on the device, so
  // a configuration only has to match a family.
  families: string[]
  packageSize: number
  /**
   * The stored package's payload CRC, when the firmware reports one. It lets a
   * save skip an upload whose bytes the board already holds. Older firmware
   * omits the key, which reads as "cannot tell" and so as "upload anyway".
   *
   * The CRC covers the face data and not the manifest, so comparing it answers
   * only half the question — `families` answers the other half.
   */
  payloadCrc?: number
  rebootRequired: boolean
}

export type DeviceConfiguration = ApplicationConfiguration

export interface DeviceSession {
  info: DeviceInfo
  configuration: DeviceConfiguration
  fontAssets?: FontAssetDeviceInfo
  // Absent when the firmware predates uploaded images, the same way font
  // support is reported: an older board answers the probe with an unknown
  // command rather than an error worth showing.
  imageAssets?: ImageAssetState
  // Absent on a board flashed before the OTA partition layout, which has one
  // application partition and no slot to update into.
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
}

// Applying changes only what the device is rendering. Flash is untouched, so a
// restart returns to the last saved configuration.
export interface DeviceConfigurationApplyResult {
  configuration: DeviceConfiguration
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
