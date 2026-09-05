import type { SerialPort } from 'serialport'

import { MAXIMUM_CONFIGURATION_PAYLOAD_SIZE, type DeviceErrorCode } from '@shared/device'
import { describeDeviceError } from '@shared/device-error-message'
import { DeviceServiceError } from './device-errors'
import { exchangeLines } from './line-exchange'
import { t } from '@shared/ui-text'

export type TrafficCallback = (direction: 'rx' | 'tx', data: string) => void

export const CONFIGURATION_RESPONSE_PREFIX = '@PR:OK:CONFIG:'
const MAXIMUM_RESPONSE_BUFFER_SIZE =
  CONFIGURATION_RESPONSE_PREFIX.length +
  'dashboard:'.length +
  MAXIMUM_CONFIGURATION_PAYLOAD_SIZE +
  '\r\n'.length
const CONTROL_COMMAND_TIMEOUT_MS = 3_000
const DEVICE_ERROR_PREFIX = '@PR:ERR:'

export function requestResponse(
  port: SerialPort,
  request: string,
  responsePrefix: string,
  timeoutMs: number,
  onTraffic: TrafficCallback,
  rejectionCode: DeviceErrorCode = 'not_pitrig'
): Promise<string> {
  return exchangeLines<string>(port, {
    timeoutMs,
    bufferLimit: MAXIMUM_RESPONSE_BUFFER_SIZE,
    onReceive: (text) => onTraffic('rx', text),
    consume: (lines) => {
      const response = lines.find((line) => line.startsWith(responsePrefix))
      if (response) return { value: response }
      const deviceError = lines.find((line) => line.startsWith(DEVICE_ERROR_PREFIX))
      if (!deviceError) return undefined
      const token = deviceError.slice(DEVICE_ERROR_PREFIX.length).trim()
      return {
        error: new DeviceServiceError(rejectionCode, describeDeviceError(token), token)
      }
    },
    onTimeout: () => ({
      error: new DeviceServiceError(
        rejectionCode,
        t('device.serialRequest.theDeviceDidNotAnswer', { trim: request.trim() })
      )
    }),
    onClose: () =>
      new DeviceServiceError('serial_error', t('device.serialRequest.serialPortClosedDuringRequest')),
    send: (fail, isSettled) => {
      port.flush(() => {
        if (!port.isOpen || isSettled()) return
        port.write(request, (error) => {
          if (error) fail(error)
          else onTraffic('tx', request)
        })
      })
    }
  })
}

export function sendControlCommand(
  port: SerialPort,
  command: string,
  onTraffic: TrafficCallback
): Promise<string[]> {
  const request = `${command}\n`
  const collected: string[] = []

  return exchangeLines<string[]>(port, {
    timeoutMs: CONTROL_COMMAND_TIMEOUT_MS,
    bufferLimit: MAXIMUM_RESPONSE_BUFFER_SIZE,
    onReceive: (text) => onTraffic('rx', text),
    consume: (lines) => {
      for (const line of lines) {
        if (!line.startsWith('@PR:')) continue
        collected.push(line)
        if (line.startsWith('@PR:OK:') || line.startsWith(DEVICE_ERROR_PREFIX)) {
          return { value: collected }
        }
      }
      return undefined
    },
    onTimeout: () => ({ value: collected }),
    onClose: () =>
      new DeviceServiceError('serial_error', t('device.serialRequest.serialPortClosedDuringThe')),
    send: (fail) => {
      if (!port.isOpen) {
        fail(new DeviceServiceError('serial_error', t('device.serialRequest.theSerialPortIsClosed')))
        return
      }
      port.write(request, (error) => {
        if (error) fail(error)
        else onTraffic('tx', request)
      })
    }
  })
}
