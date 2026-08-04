export const DEVICE_LIST_PORTS_CHANNEL = 'device:list-ports' as const
export const DEVICE_GET_STATE_CHANNEL = 'device:get-state' as const
export const DEVICE_CONNECT_CHANNEL = 'device:connect' as const
export const DEVICE_AUTO_CONNECT_CHANNEL = 'device:auto-connect' as const
export const DEVICE_CANCEL_AUTO_CONNECT_CHANNEL = 'device:cancel-auto-connect' as const
export const DEVICE_DISCONNECT_CHANNEL = 'device:disconnect' as const
export const DEVICE_STATE_CHANGED_CHANNEL = 'device:state-changed' as const

export const DEFAULT_BAUD_RATE = 115_200

export const SUPPORTED_BAUD_RATES = [
  9_600,
  19_200,
  38_400,
  57_600,
  DEFAULT_BAUD_RATE,
  230_400,
  460_800,
  921_600
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

export type SimCoreBoardId = 't_display_s3' | 'guition_esp32_4848s040'

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
  }
}

export interface DeviceInfo {
  boardId: SimCoreBoardId
  firmwareVersion: string
  schemaVersion: 1
  display: DisplayDescriptor
  configurationSource: 'factory' | 'slot_a' | 'slot_b'
  generation: number
  storageAvailable: boolean
}

export interface Placement {
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface FontSpec {
  family?: 'roboto_mono' | 'lcd' | 'montserrat'
  size_px?: number
}

export interface TelemetryTransportConfiguration {
  id?: 'board_default' | 'native_usb_cdc' | 'uart'
  uart?: {
    port?: number
    tx_pin?: number
    rx_pin?: number
    baud_rate?: number
    silence_esp_logs?: boolean
  }
}

export type RgbColor = `#${string}`

export interface DeviceConfiguration {
  board: SimCoreBoardId
  hardware?: []
  telemetry_transport?: TelemetryTransportConfiguration
  lap_timer?: {
    telemetry_only?: boolean
    telemetry_timeout_ms?: number
  }
  delta_time?: {
    unavailable_behavior?: 'hide' | 'placeholder' | 'zero'
    placeholder?: string
    scale?: { enabled?: boolean; show_sign?: boolean; range_ms?: number }
  }
  dashboard?: {
    widgets?: {
      lap_timer?: { placement?: Placement; font?: FontSpec; text_color?: RgbColor }
      delta_time?: {
        placement?: Placement
        font?: FontSpec
        faster_color?: RgbColor
        slower_color?: RgbColor
        neutral_color?: RgbColor
        scale?: {
          vertical_padding_px?: number
          border_width_px?: number
          border_radius_px?: number
        }
      }
      text?: Array<{
        binding?: string
        placement?: Placement
        padding?: { left?: number; top?: number; right?: number; bottom?: number }
        border?: { color?: RgbColor; width_px?: number; radius_px?: number }
        title?: {
          text?: string
          font?: FontSpec
          color?: RgbColor
          offset_y_px?: number
        }
        value?: {
          font?: FontSpec
          color?: RgbColor
          alignment?: 'left' | 'center' | 'right'
          unavailable_text?: string
        }
        background_color?: RgbColor
      }>
    }
  }
}

export interface DeviceSession {
  info: DeviceInfo
  configuration: DeviceConfiguration
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

export type DeviceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeviceError }
