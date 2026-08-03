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

export interface DeviceScanProgress {
  displayName: string
  baudRate: number
  attempt: number
  totalAttempts: number
}

export interface DeviceState {
  status: DeviceStatus
  connection?: DeviceConnection
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
