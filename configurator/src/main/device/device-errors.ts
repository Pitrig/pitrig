import type {
  DeviceError,
  DeviceErrorCode,
  DeviceResult
} from '../../shared/device'

export class DeviceServiceError extends Error {
  constructor(
    readonly code: DeviceErrorCode,
    message: string,
    readonly token?: string
  ) {
    super(message)
  }
}

export function success<T>(value: T): DeviceResult<T> {
  return { ok: true, value }
}

export function failure<T>(error: DeviceError): DeviceResult<T> {
  return { ok: false, error }
}

export function toDeviceError(error: unknown): DeviceError {
  if (error instanceof DeviceServiceError) {
    return { code: error.code, message: error.message }
  }

  const message = error instanceof Error ? error.message : 'Unknown serial error.'
  const normalized = message.toLowerCase()
  if (normalized.includes('resource busy') || normalized.includes('cannot lock')) {
    return {
      code: 'port_busy',
      message: 'The serial port is busy. Close SimHub or a serial monitor.'
    }
  }
  if (normalized.includes('permission denied') || normalized.includes('access denied')) {
    return {
      code: 'permission_denied',
      message: 'Permission to open the serial port was denied.'
    }
  }
  if (normalized.includes('no such file') || normalized.includes('cannot find')) {
    return { code: 'port_missing', message: 'The serial port is no longer available.' }
  }
  return { code: 'serial_error', message }
}
